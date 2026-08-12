#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Client } from 'pg';

const outputPath = process.argv[2];
const ownerUrl = process.env.POSTGRES_URL;

if (!outputPath || !resolve(outputPath).startsWith(`${resolve(process.env.HOME ?? '/')}/.codex/`)) {
  throw new Error('Provide an absolute output path below the current user .codex directory.');
}
if (!ownerUrl) throw new Error('POSTGRES_URL is required.');

const clients = {
  coordinator: 'codex_process_coordinator_client',
  preflight: 'codex_process_preflight_client',
  judge: 'codex_process_judge_client',
  reader: 'codex_process_reader_client',
} as const;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function clientUrl(role: string, password: string): string {
  const value = new URL(ownerUrl as string);
  value.username = role;
  value.password = password;
  return value.toString();
}

const owner = new Client({ connectionString: ownerUrl });
await owner.connect();
try {
  await owner.query(await readFile(resolve('migrations/process/001_process_control.sql'), 'utf8'));
  const passwords = Object.fromEntries(
    Object.keys(clients).map((kind) => [kind, randomBytes(32).toString('hex')]),
  ) as Record<keyof typeof clients, string>;
  for (const [kind, role] of Object.entries(clients) as Array<
    [keyof typeof clients, string]
  >) {
    const exists = await owner.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
      [role],
    );
    if (exists.rows[0]?.exists) {
      await owner.query(
        `ALTER ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD ${quoteLiteral(passwords[kind])}`,
      );
    } else {
      await owner.query(
        `CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quoteLiteral(passwords[kind])}`,
      );
    }
    await owner.query(
      `GRANT ${quoteIdentifier(`process_${kind}`)} TO ${quoteIdentifier(role)}`,
    );
  }

  const content = [
    '# Generated scoped process-control clients. Do not commit or print.',
    `PROCESS_COORDINATOR_DATABASE_URL=${quoteLiteral(clientUrl(clients.coordinator, passwords.coordinator))}`,
    `PROCESS_PREFLIGHT_DATABASE_URL=${quoteLiteral(clientUrl(clients.preflight, passwords.preflight))}`,
    `PROCESS_JUDGE_DATABASE_URL=${quoteLiteral(clientUrl(clients.judge, passwords.judge))}`,
    `PROCESS_READER_DATABASE_URL=${quoteLiteral(clientUrl(clients.reader, passwords.reader))}`,
    '',
  ].join('\n');
  const target = resolve(outputPath);
  const temporary = `${target}.tmp-${process.pid}`;
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await chmod(dirname(target), 0o700);
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, target);
  await chmod(target, 0o600);
  process.stdout.write(`${JSON.stringify({ status: 'provisioned', clientCount: 4 })}\n`);
} finally {
  await owner.end();
}
