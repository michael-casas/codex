import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from 'pg';

export interface ControlDatabaseFixture {
  readonly ownerUrl: string;
  readonly daemonUrl: string;
  close(): Promise<void>;
}

function requiredOwnerUrl(): string {
  const value = process.env.POSTGRES_URL;
  if (!value) throw new Error('POSTGRES_URL is required for daemon E2E.');
  return value;
}

function databaseUrl(base: string, database: string): string {
  const value = new URL(base);
  value.pathname = `/${database}`;
  return value.toString();
}

function roleUrl(
  base: string,
  database: string,
  role: string,
  password: string,
): string {
  const value = new URL(databaseUrl(base, database));
  value.username = role;
  value.password = password;
  return value.toString();
}

async function ownerQuery(
  text: string,
  values: readonly unknown[] = [],
): Promise<void> {
  const client = new Client({ connectionString: requiredOwnerUrl() });
  await client.connect();
  try {
    await client.query(text, [...values]);
  } finally {
    await client.end();
  }
}

export async function createControlDatabaseFixture(): Promise<ControlDatabaseFixture> {
  const suffix = `${process.pid}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const databaseName = `codex_control_test_${suffix}`;
  const daemonRole = `c3_daemon_${suffix}`;
  const daemonPassword = randomBytes(24).toString('hex');
  await ownerQuery(`CREATE DATABASE ${databaseName}`);
  const ownerUrl = databaseUrl(requiredOwnerUrl(), databaseName);
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(
      await readFile(
        resolve('migrations/process/001_process_control.sql'),
        'utf8',
      ),
    );
    await client.query(
      await readFile(
        resolve('migrations/process/002_durable_control.sql'),
        'utf8',
      ),
    );
  } finally {
    await client.end();
  }
  await ownerQuery(
    `CREATE ROLE ${daemonRole} LOGIN PASSWORD '${daemonPassword}'`,
  );
  await ownerQuery(`GRANT process_daemon TO ${daemonRole}`);

  let closed = false;
  return {
    ownerUrl,
    daemonUrl: roleUrl(
      requiredOwnerUrl(),
      databaseName,
      daemonRole,
      daemonPassword,
    ),
    async close() {
      if (closed) return;
      closed = true;
      await ownerQuery(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await ownerQuery(`DROP DATABASE ${databaseName}`);
      await ownerQuery(`DROP ROLE ${daemonRole}`);
    },
  };
}
