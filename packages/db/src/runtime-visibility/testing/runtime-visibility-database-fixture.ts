import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from 'pg';

import { createControlDatabaseFixture } from '../../durable-control/testing/control-database-fixture.js';

export async function createRuntimeVisibilityDatabaseFixture() {
  const fixture = await createControlDatabaseFixture();
  const owner = new Client({ connectionString: fixture.ownerUrl });
  await owner.connect();
  try {
    await owner.query(
      await readFile(
        resolve('migrations/process/005_runtime_visibility.sql'),
        'utf8',
      ),
    );
  } catch (error) {
    await fixture.close();
    throw error;
  } finally {
    await owner.end();
  }
  return {
    ...fixture,
    async eventCount(): Promise<number> {
      const inspect = new Client({ connectionString: fixture.ownerUrl });
      await inspect.connect();
      try {
        const result = await inspect.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM process.runtime_visibility_event',
        );
        return result.rows[0]?.count ?? 0;
      } finally {
        await inspect.end();
      }
    },
  };
}
