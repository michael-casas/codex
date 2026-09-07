import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Client } from 'pg';

export interface AgentMessageDatabaseFixture {
  readonly databaseName: string;
  readonly ownerUrl: string;
  readonly daemonUrl: string;
  close(): Promise<void>;
}

function ownerUrl(): string {
  const value = process.env.POSTGRES_URL;
  if (!value) throw new Error('POSTGRES_URL is required.');
  return value;
}

function databaseUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function ownerQuery(text: string, values: readonly unknown[] = []) {
  const client = new Client({ connectionString: ownerUrl() });
  await client.connect();
  try {
    await client.query(text, [...values]);
  } finally {
    await client.end();
  }
}

async function workspaceFile(path: string): Promise<string> {
  let directory = process.cwd();
  while (true) {
    const candidate = resolve(directory, path);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate ${path}.`);
    directory = parent;
  }
}

export async function createAgentMessageDatabaseFixture(): Promise<AgentMessageDatabaseFixture> {
  const suffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const databaseName = `codex_message_test_${suffix}`;
  const role = `c5_daemon_${suffix}`;
  const password = randomBytes(24).toString('hex');
  await ownerQuery(`CREATE DATABASE ${databaseName}`);
  const scopedOwnerUrl = databaseUrl(ownerUrl(), databaseName);
  const client = new Client({ connectionString: scopedOwnerUrl });
  await client.connect();
  try {
    for (const migration of [
      '001_process_control.sql',
      '002_durable_control.sql',
      '003_agent_messaging.sql',
      '003_agent_messaging.sql',
    ]) {
      await client.query(
        await readFile(
          await workspaceFile(`migrations/process/${migration}`),
          'utf8',
        ),
      );
    }
  } finally {
    await client.end();
  }
  await ownerQuery(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  await ownerQuery(`GRANT process_daemon TO ${role}`);
  const daemon = new URL(scopedOwnerUrl);
  daemon.username = role;
  daemon.password = password;
  let closed = false;
  return {
    databaseName,
    ownerUrl: scopedOwnerUrl,
    daemonUrl: daemon.toString(),
    async close() {
      if (closed) return;
      closed = true;
      await ownerQuery(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await ownerQuery(`DROP DATABASE ${databaseName}`);
      await ownerQuery(`DROP ROLE ${role}`);
    },
  };
}
