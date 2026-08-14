import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { sha256 } from '@codex/workflows';

import { CliError } from '../cli/cli.js';

const SOURCE_LIMIT = 1_048_576;
const INPUT_LIMIT = 1_048_576;
const LEGACY_LIMIT = 8_388_608;

export interface LoadedBytes {
  path: string;
  bytes: Uint8Array;
  digest: `sha256:${string}`;
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export async function loadBytes(
  sourcePath: string,
  kind: 'source' | 'input' | 'legacy',
): Promise<LoadedBytes> {
  const allowedRoot = await realpath(process.cwd());
  let path: string;
  try {
    path = await realpath(resolve(sourcePath));
    await access(path, constants.R_OK);
  } catch (error) {
    throw Object.assign(new Error('Required path is not readable.'), {
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'ENOENT',
    });
  }
  if (!isWithin(allowedRoot, path)) {
    throw new CliError(
      'PATH_OUTSIDE_ALLOWED_ROOT',
      65,
      'Resolved path is outside the current workspace root.',
    );
  }
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new CliError(
      'SOURCE_NOT_REGULAR',
      66,
      'Required path is not a regular file.',
    );
  }
  const limit =
    kind === 'legacy'
      ? LEGACY_LIMIT
      : kind === 'input'
        ? INPUT_LIMIT
        : SOURCE_LIMIT;
  if (metadata.size > limit) {
    throw new CliError(
      'SOURCE_TOO_LARGE',
      65,
      `The ${kind} exceeds its byte limit.`,
    );
  }
  const bytes = await readFile(path);
  return { path, bytes, digest: sha256(bytes) };
}

export function parseJsonBytes(
  loaded: LoadedBytes,
  label: 'source' | 'input',
): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(loaded.bytes);
  } catch {
    throw new CliError('UTF8_INVALID', 65, `${label} must be valid UTF-8.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError('JSON_INVALID', 65, `${label} must be valid JSON.`);
  }
}
