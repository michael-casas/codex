#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

import { Client, type QueryResultRow } from 'pg';

type JsonRecord = Record<string, unknown>;

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 64,
  ) {
    super(message);
  }
}

function parseOptions(tokens: readonly string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new CliError('PROCESS_ARGUMENT_INVALID', `Invalid option near ${key ?? '<end>'}.`);
    }
    if (options.has(key)) {
      throw new CliError('PROCESS_ARGUMENT_INVALID', `Duplicate option ${key}.`);
    }
    options.set(key, value);
  }
  return options;
}

function required(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new CliError('PROCESS_ARGUMENT_MISSING', `Missing ${name}.`);
  return value;
}

function positiveInteger(options: ReadonlyMap<string, string>, name: string): number {
  const raw = required(options, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CliError('PROCESS_ARGUMENT_INVALID', `${name} must be a positive integer.`);
  }
  return value;
}

function nonnegativeInteger(options: ReadonlyMap<string, string>, name: string): number {
  const raw = required(options, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CliError('PROCESS_ARGUMENT_INVALID', `${name} must be a nonnegative integer.`);
  }
  return value;
}

function scopedUrl(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new CliError('PROCESS_SCOPED_DATABASE_URL_MISSING', `${name} is required.`, 78);
  }
  return value;
}

async function regularFile(path: string): Promise<Buffer> {
  const metadata = await lstat(path);
  if (!metadata.isFile()) {
    throw new CliError('PROCESS_ARTIFACT_NOT_REGULAR', 'Artifact must be a regular file.', 66);
  }
  return readFile(path);
}

function sha256(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function parseJson(content: Buffer, label: string): JsonRecord {
  try {
    const value = JSON.parse(content.toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as JsonRecord;
  } catch {
    throw new CliError('PROCESS_JSON_INVALID', `${label} must contain a JSON object.`, 65);
  }
}

async function queryOne<T extends QueryResultRow>(
  connectionString: string,
  text: string,
  values: readonly unknown[],
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<T>(text, [...values]);
    if (result.rowCount !== 1 || !result.rows[0]) {
      throw new CliError('PROCESS_RESULT_INVALID', 'Control-plane operation returned no row.', 70);
    }
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function registerCandidate(options: ReadonlyMap<string, string>): Promise<JsonRecord> {
  const manifestPath = required(options, '--manifest');
  const manifest = await regularFile(manifestPath);
  const row = await queryOne<{ candidate_id: string; state: string; reducer_digest: string }>(
    scopedUrl('PROCESS_COORDINATOR_DATABASE_URL'),
    'SELECT * FROM process.register_candidate($1::text,$2::integer,$3::text,$4::text,$5::text,$6::text,$7::integer,$8::jsonb,$9::bytea,$10::text,$11::text)',
    [
      required(options, '--epoch'),
      positiveInteger(options, '--attempt'),
      required(options, '--workspace'),
      required(options, '--base'),
      required(options, '--head'),
      required(options, '--digest'),
      positiveInteger(options, '--path-count'),
      parseJson(manifest, 'Candidate manifest').algorithm ?? {},
      manifest,
      sha256(manifest),
      required(options, '--idempotency-key'),
    ],
  );
  return {
    schema: 'process.cli-result.v1',
    status: 'registered',
    candidateId: row.candidate_id,
    projection: row.state,
    reducerDigest: row.reducer_digest,
  };
}

async function registerArtifact(options: ReadonlyMap<string, string>): Promise<JsonRecord> {
  const path = required(options, '--path');
  const content = await regularFile(path);
  const role = options.get('--role') ?? 'preflight';
  const environment = role === 'coordinator'
    ? 'PROCESS_COORDINATOR_DATABASE_URL'
    : role === 'judge'
      ? 'PROCESS_JUDGE_DATABASE_URL'
      : role === 'preflight'
        ? 'PROCESS_PREFLIGHT_DATABASE_URL'
        : undefined;
  if (!environment) throw new CliError('PROCESS_ROLE_INVALID', 'Artifact role is invalid.');
  const row = await queryOne<{ artifact_id: string; state: string; reducer_digest: string }>(
    scopedUrl(environment),
    'SELECT * FROM process.register_artifact($1::uuid,$2::text,$3::text,$4::text,$5::bytea,$6::text,$7::text)',
    [
      required(options, '--candidate-id'),
      required(options, '--kind'),
      path,
      required(options, '--media-type'),
      content,
      sha256(content),
      required(options, '--idempotency-key'),
    ],
  );
  return {
    schema: 'process.cli-result.v1',
    status: 'registered',
    artifactId: row.artifact_id,
    projection: row.state,
    reducerDigest: row.reducer_digest,
    sha256: sha256(content),
  };
}

async function submitPreflight(options: ReadonlyMap<string, string>): Promise<JsonRecord> {
  const evidence = parseJson(
    await regularFile(required(options, '--evidence')),
    'Preflight evidence',
  );
  const row = await queryOne<{ preflight_id: string; state: string; reducer_digest: string }>(
    scopedUrl('PROCESS_PREFLIGHT_DATABASE_URL'),
    'SELECT * FROM process.submit_preflight($1::uuid,$2::text,$3::jsonb,$4::text)',
    [
      required(options, '--candidate-id'),
      required(options, '--status'),
      evidence,
      required(options, '--idempotency-key'),
    ],
  );
  return {
    schema: 'process.cli-result.v1',
    status: 'submitted',
    preflightId: row.preflight_id,
    projection: row.state,
    reducerDigest: row.reducer_digest,
  };
}

async function submitVerdict(options: ReadonlyMap<string, string>): Promise<JsonRecord> {
  const score = nonnegativeInteger(options, '--score');
  if (score > 5) throw new CliError('PROCESS_ARGUMENT_INVALID', '--score must be at most 5.');
  const row = await queryOne<{ verdict_id: string; state: string; reducer_digest: string }>(
    scopedUrl('PROCESS_JUDGE_DATABASE_URL'),
    'SELECT * FROM process.submit_verdict($1::uuid,$2::text,$3::integer,$4::integer,$5::uuid,$6::text)',
    [
      required(options, '--candidate-id'),
      required(options, '--verdict'),
      score,
      nonnegativeInteger(options, '--blocking-violations'),
      required(options, '--report-artifact-id'),
      required(options, '--idempotency-key'),
    ],
  );
  return {
    schema: 'process.cli-result.v1',
    status: 'submitted',
    verdictId: row.verdict_id,
    projection: row.state,
    reducerDigest: row.reducer_digest,
  };
}

async function readStatus(options: ReadonlyMap<string, string>): Promise<JsonRecord> {
  const row = await queryOne<{ status: JsonRecord }>(
    scopedUrl('PROCESS_READER_DATABASE_URL'),
    'SELECT process.read_candidate_status($1::uuid) AS status',
    [required(options, '--candidate-id')],
  );
  return { schema: 'process.cli-result.v1', status: 'ok', ...row.status };
}

async function main(): Promise<JsonRecord> {
  const [resource, action, ...tokens] = process.argv.slice(2);
  if (resource === 'status') return readStatus(parseOptions(process.argv.slice(3)));
  const options = parseOptions(tokens);
  if (resource === 'candidate' && action === 'register') return registerCandidate(options);
  if (resource === 'artifact' && action === 'register') return registerArtifact(options);
  if (resource === 'preflight' && action === 'submit') return submitPreflight(options);
  if (resource === 'verdict' && action === 'submit') return submitVerdict(options);
  throw new CliError('PROCESS_COMMAND_INVALID', 'Unknown process control command.');
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (error) {
  const known = error instanceof CliError;
  const postgresCode = !known && error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
  const body = {
    schema: 'process.cli-result.v1',
    status: 'error',
    code: known ? error.code : 'PROCESS_OPERATION_REJECTED',
    detail: known ? error.message : postgresCode ? `PostgreSQL rejected the operation (${postgresCode}).` : 'Operation rejected.',
  };
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exitCode = known ? error.exitCode : 77;
}
