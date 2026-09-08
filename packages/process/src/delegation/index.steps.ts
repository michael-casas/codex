import { After, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { stat } from 'node:fs/promises';

setDefaultTimeout(120_000);

interface HandoffWorld {
  service?: any;
  handles?: any[];
  released?: number;
  close?: () => Promise<void>;
}

async function workspaceRoot() { let directory = process.cwd(); while (true) { try { if ((await stat(resolve(directory, 'packages/process/package.json'))).isFile()) return directory; } catch { /* An unavailable candidate does not stop the parent-directory search. */ } const parent = dirname(directory); if (parent === directory) throw new Error('WORKSPACE_NOT_FOUND'); directory = parent; } }
const moduleAt = (root: string, path: string) => import(pathToFileURL(resolve(root, path)).href) as Promise<any>;
const command = (hostId: string, key: string) => ({ idempotencyKey: key, assignmentRef: 'CAS-06', assignmentDigest: `sha256:${'a'.repeat(64)}`, hostId, workspace: { repositoryId: 'codex', baseRevision: 'b'.repeat(40), assignmentId: 'CAS-06' }, runtimeProfile: { model: 'gpt-5.6-luna', reasoningEffort: 'low', sandbox: 'readOnly', approvalPolicy: 'never' }, completionBoundary: 'runtime-settled', prompt: 'Reply with OK only and do not call tools.' });

Given('admitted local and authenticated remote App Server hosts', async function (this: HandoffWorld) {
  const root = await workspaceRoot();
  const [processApi, codex, fixtureApi] = await Promise.all([moduleAt(root, 'packages/process/dist/index.js'), moduleAt(root, 'packages/codex/dist/index.js'), moduleAt(root, 'packages/delivery/dist/agent-messaging/support/controlled-wss-app-server.js')]);
  const [local, remote] = await Promise.all([
    codex.connectAppServer({ expectedVersion: codex.APP_SERVER_PROTOCOL_VERSION, clientInfo: { name: 'cas06_l3', title: 'CAS-06 L3', version: codex.APP_SERVER_PROTOCOL_VERSION }, env: { ...process.env }, requestTimeoutMs: 30_000, closeTimeoutMs: 2_000 }),
    fixtureApi.createControlledWssAppServer(),
  ]);
  const records = new Map<string, any>(); let sequence = 0;
  const repository = {
    async reserve(input: any, fingerprint: string) { const record = { delegationId: `delegation-${++sequence}`, executionId: `execution-${sequence}`, agentId: `agent-${sequence}`, command: input, fingerprint, state: 'reserved' }; records.set(record.delegationId, record); return { record, replayed: false }; },
    async bind(id: string, binding: any) { const record = records.get(id); Object.assign(record, binding, { state: 'running' }); return record; },
    async read(id: string) { return records.get(id); },
    async transition(id: string, state: string, activeTurnId?: string) { const record = records.get(id); Object.assign(record, { state }, activeTurnId ? { activeTurnId } : {}); return record; },
  };
  this.released = 0;
  this.service = processApi.createDelegationService({ repository, hosts: { connect: async (hostId: string) => hostId === 'local' ? local : remote.connection }, workspaces: { acquire: async ({ hostId }: { hostId: string }) => ({ workspaceRef: `workspace:${(hostId === 'local' ? 'c' : 'd').repeat(64)}` }), resolve: async () => ({ cwd: root }), release: async () => { this.released = (this.released ?? 0) + 1; } } });
  this.close = async () => { await local.close(); await remote.close(); };
});

When('the control thread delegates one assignment to each host', async function (this: HandoffWorld) {
  assert.ok(this.service); this.handles = await Promise.all([this.service.delegateAgent(command('local', 'cas06-l3-local')), this.service.delegateAgent(command('remote', 'cas06-l3-remote'))]);
});

Then('two stable agent handles are returned without duplicate turns', function (this: HandoffWorld) {
  assert.equal(this.handles?.length, 2); assert.equal(new Set(this.handles?.map(({ threadId }) => threadId)).size, 2);
});

Then('one agent can continue while the other bounded wait is cancelled', async function (this: HandoffWorld) {
  assert.ok(this.service && this.handles); await this.service.continueAgent(this.handles[0].delegationId, 'Reply DONE only.'); await this.service.cancelAgent(this.handles[1].delegationId); assert.equal(this.released, 1);
});

After(async function (this: HandoffWorld) { await this.close?.(); });
