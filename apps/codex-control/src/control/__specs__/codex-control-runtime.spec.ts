import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import * as gateway from '../codex-control.gateway.js';
import type { CodexControlPlane } from '../codex-control.gateway.js';

type Runtime = {
  start(): Promise<{ origin: string }>;
  stop(): Promise<void>;
};

type RuntimeFactory = (options: {
  control: CodexControlPlane;
  token: string;
  uiDirectory: string;
  host?: string;
  port?: number;
}) => Runtime;

type ClientFactory = (options: {
  origin: string;
  token: string;
  actorAgentId: string;
  scopes: string[];
}) => CodexControlPlane;

describe('[L2:E2E] CAS-09.R2 loopback control runtime', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function fixture() {
    const uiDirectory = await mkdtemp(join(tmpdir(), 'cas-09-r2-ui-'));
    await writeFile(join(uiDirectory, 'index.html'), '<h1>Codex Control</h1>');
    cleanups.push(() => rm(uiDirectory, { recursive: true, force: true }));
    const calls: string[] = [];
    const control: CodexControlPlane = {
      delegateAgent: async () => {
        calls.push('delegate');
        return {
          delegationId: 'delegation-1',
          executionId: 'execution-1',
          agentId: 'agent-1',
          hostId: 'local',
          threadId: 'thread-1',
        };
      },
      sendAgentMessage: async () => ({}),
      runWorkflow: async () => ({}),
      cancelAgent: async () => ({}),
      cancelWorkflow: async () => ({}),
      snapshot: async (query) => ({
        cursor: '7',
        changed: true,
        selectedAgentId: query.selectedAgentId,
        workflows: [],
      }),
      wait: async (_query, _authorization, signal) =>
        await new Promise((_, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        ),
    };
    return { uiDirectory, calls, control };
  }

  it('serves routes and maps one authenticated client call to one operation', async () => {
    const createRuntime = (gateway as Record<string, unknown>)[
      'createControlHttpServer'
    ] as RuntimeFactory | undefined;
    const createClient = (gateway as Record<string, unknown>)[
      'createControlHttpClient'
    ] as ClientFactory | undefined;
    expect(createRuntime).toBeTypeOf('function');
    expect(createClient).toBeTypeOf('function');
    if (!createRuntime || !createClient)
      throw new Error('CONTROL_HTTP_RUNTIME_MISSING');

    const { uiDirectory, calls, control } = await fixture();
    const runtime = createRuntime({
      control,
      token: 'a'.repeat(64),
      uiDirectory,
      port: 0,
    });
    cleanups.push(() => runtime.stop());
    const { origin } = await runtime.start();
    const response = await fetch(`${origin}/workflows/workflow-1`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Codex Control');

    const client = createClient({
      origin,
      token: 'a'.repeat(64),
      actorAgentId: 'agent-owner',
      scopes: ['control:delegate'],
    });
    await client.delegateAgent(
      {},
      {
        actorAgentId: 'ignored',
        scopes: [],
      },
    );
    expect(calls).toEqual(['delegate']);
  });

  it('denies wrong credentials and cross-origin reads without an operation', async () => {
    const createRuntime = (gateway as Record<string, unknown>)[
      'createControlHttpServer'
    ] as RuntimeFactory | undefined;
    expect(createRuntime).toBeTypeOf('function');
    if (!createRuntime) throw new Error('CONTROL_HTTP_RUNTIME_MISSING');
    const { uiDirectory, calls, control } = await fixture();
    const runtime = createRuntime({
      control,
      token: 'a'.repeat(64),
      uiDirectory,
      port: 0,
    });
    cleanups.push(() => runtime.stop());
    const { origin } = await runtime.start();

    const unauthorized = await fetch(`${origin}/api/control/delegateAgent`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${'b'.repeat(64)}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.text()).not.toContain('a'.repeat(64));

    const crossOrigin = await fetch(`${origin}/api/control/snapshot`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(crossOrigin.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('aborts a pending wait and releases a conflicting listener', async () => {
    const createRuntime = (gateway as Record<string, unknown>)[
      'createControlHttpServer'
    ] as RuntimeFactory | undefined;
    expect(createRuntime).toBeTypeOf('function');
    if (!createRuntime) throw new Error('CONTROL_HTTP_RUNTIME_MISSING');
    const { uiDirectory, control } = await fixture();
    const first = createRuntime({
      control,
      token: 'a'.repeat(64),
      uiDirectory,
      port: 0,
    });
    cleanups.push(() => first.stop());
    const { origin } = await first.start();
    const port = Number(new URL(origin).port);
    const second = createRuntime({
      control,
      token: 'a'.repeat(64),
      uiDirectory,
      port,
    });
    await expect(second.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await second.stop();

    const controller = new AbortController();
    const pending = fetch(
      `${origin}/api/control/wait?afterCursor=0&waitMs=30000`,
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
