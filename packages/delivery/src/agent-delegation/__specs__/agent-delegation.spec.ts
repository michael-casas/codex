import { describe, expect, test } from 'vitest';
import { createDelegationService, type DelegationRepository } from '@codex/process';
import { createControlledWssAppServer } from '../../agent-messaging/support/controlled-wss-app-server.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] controlled authenticated WSS delegation', () => {
  test('starts and cancels one bound turn through the public handoff seam', async () => {
    const remote = await createControlledWssAppServer();
    const records = new Map<string, any>(); let released = 0;
    const repository = {
      async reserve(command: any, fingerprint: string) { const record = { delegationId: crypto.randomUUID(), executionId: crypto.randomUUID(), agentId: crypto.randomUUID(), command, fingerprint, state: 'reserved' }; records.set(record.delegationId, record); return { record, replayed: false }; },
      async bind(id: string, binding: any) { const record = records.get(id); Object.assign(record, binding, { state: 'running' }); return record; },
      async read(id: string) { return records.get(id); },
      async transition(id: string, state: string, activeTurnId?: string) { const record = records.get(id); Object.assign(record, { state }, activeTurnId ? { activeTurnId } : {}); return record; },
    };
    const service = createDelegationService({ repository: repository as DelegationRepository,
      hosts: { connect: async () => remote.connection },
      workspaces: { acquire: async () => ({ workspaceRef: `workspace:${'c'.repeat(64)}` }), resolve: async () => ({ cwd: process.cwd() }), release: async () => void (released += 1) },
    });
    try {
      const handle = await service.delegateAgent({ idempotencyKey: 'cas06-controlled-wss', assignmentRef: 'CAS-06', assignmentDigest: `sha256:${'a'.repeat(64)}`, hostId: 'cas05-controlled-remote', workspace: { repositoryId: 'codex', baseRevision: 'b'.repeat(40), assignmentId: 'CAS-06' }, runtimeProfile: { model: 'gpt-5.6-sol', reasoningEffort: 'medium', sandbox: 'readOnly', approvalPolicy: 'never' }, completionBoundary: 'runtime-settled', prompt: 'Reply with OK only.' });
      expect(handle).toMatchObject({ hostId: 'cas05-controlled-remote', threadId: expect.any(String) });
      await service.cancelAgent(handle.delegationId); expect(released).toBe(1);
    } finally { await remote.close(); }
  }, 30_000);
});
