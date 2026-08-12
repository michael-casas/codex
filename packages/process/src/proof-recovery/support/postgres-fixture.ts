import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Client } from 'pg';

export interface ProcessPostgresFixture {
  readonly databaseName: string;
  readonly ownerUrl: string;
  readonly coordinatorUrl: string;
  readonly preflightUrl: string;
  readonly judgeUrl: string;
  readonly readerUrl: string;
  readonly workerUrl: string;
  close(): Promise<void>;
}

function requiredOwnerUrl(): string {
  const value = process.env.POSTGRES_URL;
  if (!value) throw new Error('POSTGRES_URL is required for the PostgreSQL fixture.');
  return value;
}

function databaseUrl(base: string, database: string): string {
  const value = new URL(base);
  value.pathname = `/${database}`;
  return value.toString();
}

function roleUrl(base: string, database: string, role: string, password: string): string {
  const value = new URL(databaseUrl(base, database));
  value.username = role;
  value.password = password;
  return value.toString();
}

async function ownerQuery(text: string, values: readonly unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: requiredOwnerUrl() });
  await client.connect();
  try {
    await client.query(text, [...values]);
  } finally {
    await client.end();
  }
}

export async function workspaceFile(relativePath: string): Promise<string> {
  let directory = process.cwd();
  while (true) {
    const candidate = resolve(directory, relativePath);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate workspace file ${relativePath}.`);
    directory = parent;
  }
}

export async function createProcessPostgresFixture(): Promise<ProcessPostgresFixture> {
  const suffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const databaseName = `codex_process_test_${suffix}`;
  const roles = {
    coordinator: `cpx_coord_${suffix}`,
    preflight: `cpx_pre_${suffix}`,
    judge: `cpx_judge_${suffix}`,
    reader: `cpx_read_${suffix}`,
    worker: `cpx_worker_${suffix}`,
  } as const;
  const passwords = Object.fromEntries(
    Object.keys(roles).map((role) => [role, randomBytes(24).toString('hex')]),
  ) as Record<keyof typeof roles, string>;

  await ownerQuery(`CREATE DATABASE ${databaseName}`);
  const databaseOwnerUrl = databaseUrl(requiredOwnerUrl(), databaseName);
  const databaseOwner = new Client({ connectionString: databaseOwnerUrl });
  await databaseOwner.connect();
  try {
    const migration = await readFile(await workspaceFile('migrations/process/001_process_control.sql'), 'utf8');
    await databaseOwner.query(migration);
  } finally {
    await databaseOwner.end();
  }

  for (const [kind, role] of Object.entries(roles) as Array<
    [keyof typeof roles, string]
  >) {
    await ownerQuery(`CREATE ROLE ${role} LOGIN PASSWORD '${passwords[kind]}'`);
  }
  await ownerQuery(`GRANT process_coordinator TO ${roles.coordinator}`);
  await ownerQuery(`GRANT process_preflight TO ${roles.preflight}`);
  await ownerQuery(`GRANT process_judge TO ${roles.judge}`);
  await ownerQuery(`GRANT process_reader TO ${roles.reader}`);

  let closed = false;
  return {
    databaseName,
    ownerUrl: databaseOwnerUrl,
    coordinatorUrl: roleUrl(requiredOwnerUrl(), databaseName, roles.coordinator, passwords.coordinator),
    preflightUrl: roleUrl(requiredOwnerUrl(), databaseName, roles.preflight, passwords.preflight),
    judgeUrl: roleUrl(requiredOwnerUrl(), databaseName, roles.judge, passwords.judge),
    readerUrl: roleUrl(requiredOwnerUrl(), databaseName, roles.reader, passwords.reader),
    workerUrl: roleUrl(requiredOwnerUrl(), databaseName, roles.worker, passwords.worker),
    async close() {
      if (closed) return;
      closed = true;
      await ownerQuery(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await ownerQuery(`DROP DATABASE ${databaseName}`);
      for (const role of Object.values(roles)) {
        await ownerQuery(`DROP ROLE ${role}`);
      }
    },
  };
}
