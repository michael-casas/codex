import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import {
  isWorkflowDefinition,
  type WorkflowDefinition,
} from '@codex/workflows';

import { CliError } from '../cli/cli.js';
import { loadBytes, type LoadedBytes } from './loader.js';

export const TYPESCRIPT_WORKFLOW_SHEBANG = '#!/usr/bin/env -S codex-workflows';

const authoringEntry = createRequire(import.meta.url).resolve(
  '@codex/workflows',
);

export interface LoadedTypeScriptWorkflow {
  source: LoadedBytes;
  definition: WorkflowDefinition<unknown, unknown>;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(
      'UTF8_INVALID',
      65,
      'TypeScript source must be valid UTF-8.',
    );
  }
}

export async function loadTypeScriptWorkflow(
  sourcePath: string,
): Promise<LoadedTypeScriptWorkflow> {
  const source = await loadBytes(sourcePath, 'source');
  if (extname(source.path) !== '.ts') {
    throw new CliError(
      'TYPESCRIPT_EXTENSION_INVALID',
      65,
      'Trusted executable workflow source must use the .ts extension.',
    );
  }
  const text = decode(source.bytes);
  if (text.split('\n', 1)[0] !== TYPESCRIPT_WORKFLOW_SHEBANG) {
    throw new CliError(
      'TYPESCRIPT_SHEBANG_INVALID',
      65,
      `The first line must be exactly ${TYPESCRIPT_WORKFLOW_SHEBANG}.`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'codex-workflows-ts-'));
  const output = join(temporaryRoot, 'workflow.mjs');
  try {
    try {
      await build({
        absWorkingDir: process.cwd(),
        entryPoints: [source.path],
        outfile: output,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        sourcemap: false,
        logLevel: 'silent',
        treeShaking: true,
        alias: { '@codex/workflows': authoringEntry },
      });
    } catch {
      throw new CliError(
        'TYPESCRIPT_SOURCE_INVALID',
        65,
        'Trusted TypeScript workflow compilation failed.',
      );
    }
    let loaded: { default?: unknown };
    try {
      loaded = (await import(
        `${pathToFileURL(output).href}?source=${encodeURIComponent(source.digest)}`
      )) as { default?: unknown };
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(
        'TYPESCRIPT_SOURCE_INVALID',
        65,
        'Trusted TypeScript workflow module loading failed.',
      );
    }
    if (!isWorkflowDefinition(loaded.default)) {
      throw new CliError(
        'TYPESCRIPT_WORKFLOW_EXPORT_INVALID',
        65,
        'TypeScript workflow must default-export defineWorkflow(...).',
      );
    }
    return { source, definition: loaded.default };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
