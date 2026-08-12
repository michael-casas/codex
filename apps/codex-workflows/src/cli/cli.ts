import { extname } from 'node:path';

import {
  canonicalizeJson,
  normalizeWorkflow,
  parseLegacyPi,
  planWorkflow,
  sha256,
  validateWorkflowDefinitionInput,
  validateWorkflowInput,
  WorkflowValidationError,
  type JsonValue,
  type NormalizedWorkflow,
  type WorkflowPublicEvent,
  type WorkflowSource,
} from '@orchestration/workflows';

import { runLocalWorkflow } from '../runtime/local-runner.js';
import {
  loadBytes,
  parseJsonBytes,
  type LoadedBytes,
} from '../source/loader.js';
import { loadTypeScriptWorkflow } from '../source/typescript.js';

export type CommandName =
  | 'validate'
  | 'inspect'
  | 'plan'
  | 'dry-run'
  | 'import-pi'
  | 'run'
  | 'resume'
  | 'status'
  | 'events'
  | 'logs'
  | 'cancel';

export interface ParsedCli {
  command: CommandName;
  subject: string;
  inputPath?: string;
  json: boolean;
}

export interface CliExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    readonly exitCode: 64 | 65 | 66 | 67 | 68 | 69 | 70 | 130,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

const commands = new Set<CommandName>([
  'validate',
  'inspect',
  'plan',
  'dry-run',
  'import-pi',
  'run',
  'resume',
  'status',
  'events',
  'logs',
  'cancel',
]);
const inputCommands = new Set<CommandName>([
  'validate',
  'plan',
  'dry-run',
  'run',
]);

const usage = `codex-workflows <workflow.ts> [--input <json-file>] [--json]
codex-workflows <workflow.ts> --plan|--dry-run [--input <json-file>] [--json]
codex-workflows run <workflow.ts> [--input <json-file>] [--json]
codex-workflows validate <source> [--input <json-file>] [--json]
codex-workflows inspect <source> [--json]
codex-workflows plan <source> [--input <json-file>] [--json]
codex-workflows dry-run <source> [--input <json-file>] [--json]
codex-workflows import-pi <goal-or-events-path> [--json]
codex-workflows resume|status|events|logs|cancel <run-id> [--json]
`;

export function parseCliArgs(argv: string[]): ParsedCli {
  const first = argv[0];
  let command: CommandName;
  let subject: string | undefined;
  let flagIndex: number;
  let bare = false;
  if (first && commands.has(first as CommandName)) {
    command = first as CommandName;
    subject = argv[1];
    flagIndex = 2;
  } else if (first?.endsWith('.ts')) {
    command = 'run';
    subject = first;
    flagIndex = 1;
    bare = true;
  } else {
    throw new CliError(
      'UNKNOWN_COMMAND',
      64,
      'A supported command or TypeScript workflow is required.',
    );
  }
  if (!subject || subject.startsWith('-')) {
    throw new CliError(
      'MISSING_SUBJECT',
      64,
      'A source path or run ID is required.',
    );
  }
  let json = false;
  let inputPath: string | undefined;
  let inspectionFlag: 'plan' | 'dry-run' | undefined;
  for (let index = flagIndex; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json' && !json) {
      json = true;
      continue;
    }
    if (
      (value === '--plan' || value === '--dry-run') &&
      !inspectionFlag &&
      (bare || command === 'run')
    ) {
      inspectionFlag = value.slice(2) as 'plan' | 'dry-run';
      continue;
    }
    if (value === '--input' && inputCommands.has(command) && !inputPath) {
      inputPath = argv[index + 1];
      if (!inputPath || inputPath.startsWith('-')) {
        throw new CliError(
          'MISSING_INPUT_VALUE',
          64,
          '--input requires a JSON file path.',
        );
      }
      index += 1;
      continue;
    }
    throw new CliError(
      'UNKNOWN_FLAG',
      64,
      `Unsupported or duplicate flag: ${value ?? ''}`,
    );
  }
  if (inspectionFlag) command = inspectionFlag;
  if (
    (command === 'plan' || command === 'dry-run') &&
    extname(subject) !== '.ts' &&
    !inputPath
  ) {
    throw new CliError('MISSING_INPUT', 64, `${command} requires --input.`);
  }
  return { command, subject, ...(inputPath ? { inputPath } : {}), json };
}

const runtimeErrors: Record<
  string,
  { exitCode: 65 | 67 | 68 | 69 | 70 | 130; message: string }
> = {
  TYPESCRIPT_SHEBANG_INVALID: {
    exitCode: 65,
    message: 'TypeScript workflow source admission failed.',
  },
  WORKFLOW_DEFINITION_INVALID: {
    exitCode: 65,
    message: 'TypeScript workflow definition validation failed.',
  },
  WORKFLOW_INPUT_INVALID: {
    exitCode: 65,
    message: 'Workflow input validation failed.',
  },
  WORKFLOW_AGENT_FAILED: {
    exitCode: 67,
    message: 'A local workflow agent failed.',
  },
  WORKFLOW_ARTIFACT_FAILED: {
    exitCode: 70,
    message: 'A local workflow artifact could not be published.',
  },
  WORKFLOW_OUTPUT_SCHEMA_FAILED: {
    exitCode: 68,
    message: 'A local workflow agent returned invalid structured output.',
  },
  CONTROL_PLANE_UNAVAILABLE: {
    exitCode: 69,
    message: 'The durable cross-process control plane is unavailable.',
  },
  WORKFLOW_CANCELLED: {
    exitCode: 130,
    message: 'The local workflow was cancelled.',
  },
};

export function mapCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof WorkflowValidationError) {
    return new CliError(
      'WORKFLOW_INVALID',
      65,
      `Workflow validation failed: ${error.issues.map((issue) => issue.code).join(', ')}.`,
      { issues: error.issues },
    );
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? error.details
      : undefined;
  const runtime = code ? runtimeErrors[code] : undefined;
  if (runtime && code) {
    return new CliError(code, runtime.exitCode, runtime.message, details);
  }
  if (['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR'].includes(code ?? '')) {
    return new CliError(
      'SOURCE_NOT_READABLE',
      66,
      'Required path is not readable.',
    );
  }
  return new CliError(
    'INTERNAL_ERROR',
    70,
    'An attributed internal failure occurred.',
  );
}

interface PreparedWorkflow {
  source: LoadedBytes;
  workflow: NormalizedWorkflow;
}

async function prepareJson(sourcePath: string): Promise<PreparedWorkflow> {
  const source = await loadBytes(sourcePath, 'source');
  return {
    source,
    workflow: normalizeWorkflow(parseJsonBytes(source, 'source')),
  };
}

async function input(
  path: string,
): Promise<{ loaded: LoadedBytes; value: JsonValue }> {
  const loaded = await loadBytes(path, 'input');
  return { loaded, value: parseJsonBytes(loaded, 'input') as JsonValue };
}

function redactedDefinition(source: WorkflowSource): unknown {
  return {
    ...source,
    steps: source.steps.map((step) => {
      if (
        (step.kind === 'task' || step.kind === 'fan-out') &&
        step.handler.type === 'codex'
      ) {
        return {
          ...step,
          handler: { ...step.handler, prompt: '[redacted]' },
        };
      }
      if (step.kind === 'subworkflow') {
        return { ...step, workflow: redactedDefinition(step.workflow) };
      }
      return step;
    }),
  };
}

async function jsonCommand(
  parsed: ParsedCli,
): Promise<Record<string, unknown>> {
  if (parsed.command === 'run') {
    throw new CliError(
      'CONTROL_PLANE_UNAVAILABLE',
      69,
      'Declarative JSON execution requires the future durable control plane.',
    );
  }
  const prepared = await prepareJson(parsed.subject);
  const common = {
    schemaVersion: 1,
    ok: true,
    command: parsed.command,
    sourcePath: prepared.source.path,
    sourceDigest: prepared.source.digest,
    definitionDigest: prepared.workflow.digest,
    workflowId: prepared.workflow.definition.id,
    workflowVersion: prepared.workflow.definition.version,
    stepCount: prepared.workflow.definition.steps.length,
    dependencyEdges: prepared.workflow.dependencyEdges,
    requiredCapabilities: prepared.workflow.requiredCapabilities,
  };

  if (parsed.command === 'inspect') {
    return {
      ...common,
      policy: prepared.workflow.definition.policy,
      normalizedDefinition: redactedDefinition(prepared.workflow.definition),
      childDigests: prepared.workflow.childDigests,
    };
  }
  let loadedInput: Awaited<ReturnType<typeof input>> | undefined;
  if (parsed.inputPath) {
    loadedInput = await input(parsed.inputPath);
    validateWorkflowInput(prepared.workflow, loadedInput.value);
  }
  if (parsed.command === 'validate') {
    return {
      ...common,
      ...(loadedInput
        ? {
            inputPath: loadedInput.loaded.path,
            inputSourceDigest: loadedInput.loaded.digest,
            inputDigest: sha256(canonicalizeJson(loadedInput.value)),
          }
        : {}),
    };
  }
  if (!loadedInput) {
    throw new CliError(
      'MISSING_INPUT',
      64,
      `${parsed.command} requires --input.`,
    );
  }
  const plan = planWorkflow(prepared.workflow, loadedInput.value);
  return {
    ...common,
    inputPath: loadedInput.loaded.path,
    inputSourceDigest: loadedInput.loaded.digest,
    inputDigest: plan.inputDigest,
    nodes: plan.nodes,
    warnings: plan.warnings,
    policy: plan.policy,
    ...(parsed.command === 'dry-run'
      ? { sideEffects: [], sdkInitialized: false, durableWrites: 0 }
      : {}),
  };
}

async function typeScriptCommand(
  parsed: ParsedCli,
  options: ExecuteCliOptions,
): Promise<Record<string, unknown>> {
  const loaded = await loadTypeScriptWorkflow(parsed.subject);
  const loadedInput = parsed.inputPath
    ? await input(parsed.inputPath)
    : undefined;
  const value = loadedInput?.value ?? {};
  validateWorkflowDefinitionInput(loaded.definition, value);
  const common = {
    schemaVersion: 1,
    ok: true,
    command: parsed.command,
    mode: 'local-trusted-typescript',
    trustedLocalCode: true,
    sourcePath: loaded.source.path,
    sourceDigest: loaded.source.digest,
    workflowId: loaded.definition.id,
    workflowVersion: loaded.definition.version,
    maxConcurrency: loaded.definition.maxConcurrency,
    ...(loadedInput
      ? {
          inputPath: loadedInput.loaded.path,
          inputSourceDigest: loadedInput.loaded.digest,
          inputDigest: sha256(canonicalizeJson(value)),
        }
      : {}),
  };
  if (parsed.command === 'validate' || parsed.command === 'inspect') {
    return {
      ...common,
      agentsLaunched: 0,
      executableBoundary: 'trusted-local-code',
    };
  }
  if (parsed.command === 'plan' || parsed.command === 'dry-run') {
    return {
      ...common,
      agentsLaunched: 0,
      dynamicNodeGraph: true,
      inspectionScope:
        'Definition metadata only; dynamic nodes freeze immediately before local launch.',
      ...(parsed.command === 'dry-run'
        ? {
            inspectionEffects: ['trusted-typescript-module-load'],
            agentLaunches: 0,
            sdkInitialized: false,
            durableWrites: 0,
          }
        : {}),
    };
  }
  const result = await runLocalWorkflow({
    definition: loaded.definition,
    sourcePath: loaded.source.path,
    sourceDigest: loaded.source.digest,
    input: value,
    ...(options.signal ? { signal: options.signal } : {}),
    workingDirectory: process.cwd(),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });
  return {
    ...common,
    runId: result.runId,
    journalPath: result.journalPath,
    status: result.status,
    output: result.output,
    nodeCount: result.nodes,
    artifactCount: result.artifacts,
  };
}

export interface ExecuteCliOptions {
  signal?: AbortSignal;
  onProgress?: (event: WorkflowPublicEvent) => void | Promise<void>;
}

async function localCommand(
  parsed: ParsedCli,
  options: ExecuteCliOptions,
): Promise<Record<string, unknown>> {
  if (parsed.command === 'import-pi') {
    const legacy = await loadBytes(parsed.subject, 'legacy');
    return {
      ok: true,
      command: parsed.command,
      sourcePath: legacy.path,
      ...parseLegacyPi(legacy.bytes),
    };
  }
  if (
    ['resume', 'status', 'events', 'logs', 'cancel'].includes(parsed.command)
  ) {
    throw new CliError(
      'CONTROL_PLANE_UNAVAILABLE',
      69,
      'Cross-process durable run control is not implemented.',
    );
  }
  return extname(parsed.subject) === '.ts'
    ? typeScriptCommand(parsed, options)
    : jsonCommand(parsed);
}

function human(payload: Record<string, unknown>): string {
  const command = String(payload.command ?? 'command');
  const identity = payload.workflowId
    ? ` ${String(payload.workflowId)}@${String(payload.workflowVersion)}`
    : '';
  const run = payload.runId ? ` ${String(payload.runId)}` : '';
  const digest = payload.definitionDigest
    ? ` ${String(payload.definitionDigest)}`
    : '';
  return `OK ${command}${identity}${run}${digest}\n`;
}

function errorDocument(error: CliError): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ok: false,
    code: error.code,
    message: error.message,
    exitCode: error.exitCode,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export async function executeCli(
  argv: string[],
  options: ExecuteCliOptions = {},
): Promise<CliExecution> {
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0] ?? '')) {
    return { exitCode: 0, stdout: usage, stderr: '' };
  }
  const jsonRequested = argv.includes('--json');
  try {
    const parsed = parseCliArgs(argv);
    const payload = await localCommand(parsed, options);
    return {
      exitCode: 0,
      stdout: parsed.json ? `${JSON.stringify(payload)}\n` : human(payload),
      stderr: '',
    };
  } catch (caught) {
    const error = mapCliError(caught);
    const payload = errorDocument(error);
    return {
      exitCode: error.exitCode,
      stdout: '',
      stderr: jsonRequested
        ? `${JSON.stringify(payload)}\n`
        : `${error.code}: ${error.message} (exit ${error.exitCode})\n`,
    };
  }
}
