import { createHash } from 'node:crypto';
import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as compilerVersion } from 'esbuild';
import { isWorkflowDefinition } from '../../authoring/api.js';
import type { WorkflowDefinition } from '../../authoring/types.js';
import type { WorkflowSourceIdentity } from '../../application/commands/submit-workflow-source/submit-workflow-source.command.js';

export class WorkflowSourceCompilerError extends Error {
  override readonly name = 'WorkflowSourceCompilerError';
  constructor(readonly code: string) {
    super(code);
  }
}
const digest = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
function within(root: string, path: string) {
  const suffix = relative(root, path);
  return suffix === '' || (!suffix.startsWith('..') && !isAbsolute(suffix));
}

async function compile(source: string, sourceRoot: string): Promise<string> {
  let root: string;
  let entry: string;
  try {
    root = await realpath(sourceRoot);
    entry = await realpath(resolve(root, source));
  } catch {
    throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_NOT_FOUND');
  }
  if (!within(root, entry))
    throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_OUTSIDE_ROOT');
  if (!entry.endsWith('.workflow.ts'))
    throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_EXTENSION_INVALID');
  const ownExtension = extname(fileURLToPath(import.meta.url));
  const authoringEntry = fileURLToPath(
    new URL(`../../authoring/api${ownExtension}`, import.meta.url),
  );
  const libraryRoot = await realpath(
    fileURLToPath(new URL('../../', import.meta.url)),
  );
  const inputs = new Map<string, string>();
  let sourceBytes = 0;
  try {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      write: false,
      metafile: true,
      logLevel: 'silent',
      logOverride: {
        'unsupported-dynamic-import': 'error',
        'unsupported-require-call': 'error',
      },
      alias: { '@codex/workflows': authoringEntry },
      plugins: [
        {
          name: 'authorized-source-closure',
          setup(builder) {
            builder.onLoad({ filter: /./ }, async ({ path }) => {
              const actual = await realpath(path);
              if (!within(root, actual) && !within(libraryRoot, actual))
                throw new WorkflowSourceCompilerError(
                  'WORKFLOW_IMPORT_OUTSIDE_ROOT',
                );
              const metadata = await stat(actual);
              if (!metadata.isFile() || metadata.size > 1_048_576)
                throw new WorkflowSourceCompilerError(
                  'WORKFLOW_SOURCE_SIZE_INVALID',
                );
              const bytes = await readFile(actual);
              sourceBytes += bytes.byteLength;
              if (sourceBytes > 8_388_608 || inputs.size >= 128)
                throw new WorkflowSourceCompilerError(
                  'WORKFLOW_SOURCE_LIMIT_EXCEEDED',
                );
              inputs.set(actual, digest(bytes));
              const extension = extname(actual);
              return {
                contents: bytes,
                loader:
                  extension === '.ts'
                    ? 'ts'
                    : extension === '.json'
                      ? 'json'
                      : 'js',
                resolveDir: dirname(actual),
              };
            });
          },
        },
      ],
    });
    if (
      Object.values(result.metafile.outputs).some((output) =>
        output.imports.some(
          (item) => item.external && !builtins.has(item.path),
        ),
      )
    )
      throw new WorkflowSourceCompilerError('WORKFLOW_IMPORT_UNBOUND');
    const code = result.outputFiles[0]?.text;
    if (!code || Buffer.byteLength(code) > 8_388_608)
      throw new WorkflowSourceCompilerError('WORKFLOW_COMPILE_INVALID');
    const closure = digest(
      JSON.stringify({
        compilerVersion,
        inputs: [...inputs].sort(([a], [b]) => a.localeCompare(b)),
      }),
    );
    return `// workflow-source-closure:${closure}\n${code}`;
  } catch (error) {
    if (error instanceof WorkflowSourceCompilerError) throw error;
    throw new WorkflowSourceCompilerError('WORKFLOW_COMPILE_INVALID');
  }
}

async function definitionFrom(url: string): Promise<WorkflowDefinition> {
  let loaded: { default?: unknown };
  try {
    loaded = (await import(url)) as { default?: unknown };
  } catch {
    throw new WorkflowSourceCompilerError('WORKFLOW_MODULE_LOAD_FAILED');
  }
  if (!isWorkflowDefinition(loaded.default))
    throw new WorkflowSourceCompilerError('WORKFLOW_EXPORT_INVALID');
  return loaded.default;
}

export async function compileWorkflowSource(
  source: string,
  context: { sourceRoot: string; artifactDirectory: string },
): Promise<WorkflowSourceIdentity> {
  const code = await compile(source, context.sourceRoot);
  const sha = digest(code);
  // Import bytes already compiled and hashed; never execute a mutable source path.
  const definition = await definitionFrom(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`,
  );
  await mkdir(context.artifactDirectory, { recursive: true, mode: 0o700 });
  const workflowRef = `source.${sha}`;
  const path = join(context.artifactDirectory, `${workflowRef}.mjs`);
  try {
    await writeFile(path, code, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      )
    )
      throw error;
    if (digest(await readFile(path)) !== sha)
      throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_INTEGRITY');
  }
  return {
    workflowRef,
    sourceDigest: `sha256:${sha}`,
    display: {
      id: definition.id,
      ...(definition.title ? { title: definition.title } : {}),
    },
  };
}

export async function loadCompiledWorkflowSource(
  artifactDirectory: string,
  workflowRef: string,
): Promise<{
  definition: WorkflowDefinition;
  sourceDigest: `sha256:${string}`;
}> {
  if (!/^source\.[a-f0-9]{64}$/.test(workflowRef))
    throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_REFERENCE_INVALID');
  const path = join(artifactDirectory, `${workflowRef}.mjs`);
  const bytes = await readFile(path);
  const sha = workflowRef.slice('source.'.length);
  if (digest(bytes) !== sha)
    throw new WorkflowSourceCompilerError('WORKFLOW_SOURCE_INTEGRITY');
  return {
    definition: await definitionFrom(
      `data:text/javascript;base64,${bytes.toString('base64')}`,
    ),
    sourceDigest: `sha256:${sha}`,
  };
}
