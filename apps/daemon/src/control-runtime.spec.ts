import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { APP_SERVER_PROTOCOL_VERSION } from '@codex/codex';
import { createRuntimeVisibilityDatabaseFixture } from '@codex/db/testing';
import { describe, expect, it } from 'vitest';

import {
  createProductionControlRuntime,
  type ProductionControlConfig,
} from './main.js';

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] CAS-09.R2 production runtime restart', () => {
  it('serves one loopback snapshot across a bounded daemon restart and cleans both listeners', async () => {
    const fixture = await createRuntimeVisibilityDatabaseFixture();
    const owner = new Client({ connectionString: fixture.ownerUrl });
    await owner.connect();
    try {
      for (const name of [
        '003_agent_messaging.sql',
        '004_agent_delegation.sql',
        '006_visibility_source_reads.sql',
      ])
        await owner.query(await readFile(`migrations/process/${name}`, 'utf8'));
    } finally {
      await owner.end();
    }
    const root = await mkdtemp(join(tmpdir(), 'cas-09-r2-daemon-'));
    const uiDirectory = join(root, 'ui');
    const tokenFile = join(root, 'token');
    const workflowModule = join(root, 'workflow.mjs');
    await mkdir(uiDirectory);
    await writeFile(join(uiDirectory, 'index.html'), '<h1>Codex Control</h1>');
    await writeFile(tokenFile, 'a'.repeat(64), { mode: 0o600 });
    await writeFile(workflowModule, 'export default {};');
    const config: ProductionControlConfig = {
      hosts: [
        {
          hostId: 'local',
          transport: 'local-proxy',
          expectedVersion: APP_SERVER_PROTOCOL_VERSION,
        },
      ],
      repositories: [
        {
          hostId: 'local',
          repositoryId: 'codex',
          checkoutPath: root,
          leaseRoot: root,
        },
      ],
      workflows: [
        { workflowRef: 'trusted.workflow', modulePath: workflowModule },
      ],
      viewer: {
        host: '127.0.0.1',
        port: 0,
        tokenFile,
        uiDirectory,
      },
    };
    const origins: string[] = [];
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const runtime = await createProductionControlRuntime(
          fixture.daemonUrl,
          fixture.ownerUrl,
          config,
        );
        await runtime.start();
        const origin = runtime.browserOrigin;
        expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        if (!origin) throw new Error('CONTROL_BROWSER_ORIGIN_MISSING');
        origins.push(origin);
        const response = await fetch(`${origin}/api/control/snapshot`);
        const body = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        expect(body).toMatchObject({ cursor: '0' });
        await runtime.stop();
        await expect(fetch(`${origin}/api/control/snapshot`)).rejects.toThrow();
      }
      expect(origins).toHaveLength(2);
    } finally {
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
