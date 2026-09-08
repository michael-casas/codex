import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { describe, expect, test } from 'vitest';

import { PostgresAgentDelegationRepository } from '../postgres-agent-delegation.repository.js';
import { createAgentMessageDatabaseFixture } from '../../agent-messaging/testing/agent-message-database-fixture.js';

const command = { idempotencyKey: 'delegate-pg-1', assignmentRef: 'CAS-06', assignmentDigest: `sha256:${'a'.repeat(64)}` as const, hostId: 'local', workspace: { repositoryId: 'codex', baseRevision: 'b'.repeat(40), assignmentId: 'CAS-06' }, runtimeProfile: { model: 'gpt-5.6-sol', reasoningEffort: 'medium', sandbox: 'workspaceWrite', approvalPolicy: 'never' }, completionBoundary: 'ready-for-audit' as const, prompt: 'Implement CAS-06.' };

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] PostgreSQL agent delegation', () => {
  test('atomically reserves, replays, binds, and rejects conflicting idempotency', async () => {
    const fixture = await createAgentMessageDatabaseFixture();
    const owner = new Client({ connectionString: fixture.ownerUrl }); await owner.connect();
    try {
      await owner.query(await readFile('migrations/process/004_agent_delegation.sql', 'utf8'));
      await owner.query(await readFile('migrations/process/008_existing_thread_handoff.sql', 'utf8'));
      const repository = new PostgresAgentDelegationRepository(fixture.daemonUrl);
      const first = await repository.reserve(command, `sha256:${'c'.repeat(64)}`);
      expect((await repository.reserve(command, `sha256:${'c'.repeat(64)}`)).record).toEqual(first.record);
      await expect(repository.reserve({ ...command, prompt: 'different' }, `sha256:${'d'.repeat(64)}`)).rejects.toThrow(/DELEGATION_IDEMPOTENCY_CONFLICT/);
      const bound = await repository.bind(first.record.delegationId, { workspaceRef: `workspace:${'e'.repeat(64)}`, threadId: 'thread-pg-1', sessionId: 'session-pg-1', activeTurnId: 'turn-pg-1' });
      expect(bound).toMatchObject({ state: 'running', threadId: 'thread-pg-1', activeTurnId: 'turn-pg-1', ownership: 'managed' });
      expect(await repository.read(first.record.delegationId)).toEqual(bound);

      const adoptedCommand = {
        ...command,
        idempotencyKey: 'adopt-pg-1',
        assignmentRef: 'CAS-EXISTING-THREAD-HANDOFF-R1',
        runtimeProfile: undefined,
        existingThread: { threadId: 'thread-existing-pg', activeTurn: { behavior: 'reject' as const } },
      };
      const adopted = await repository.reserve(adoptedCommand, `sha256:${'f'.repeat(64)}`);
      const adoptedBound = await repository.bind(adopted.record.delegationId, { threadId: 'thread-existing-pg', sessionId: 'session-existing-pg' });
      const restartedRepository = new PostgresAgentDelegationRepository(fixture.daemonUrl);
      const restarted = await restartedRepository.read(adopted.record.delegationId);
      expect(restarted).toMatchObject({ ownership: 'adopted', threadId: 'thread-existing-pg' });
      expect(restarted).not.toHaveProperty('workspaceRef');
      expect((await restartedRepository.reserve(adoptedCommand, `sha256:${'f'.repeat(64)}`)).record).toEqual(adoptedBound);
      const conflicting = await repository.reserve({ ...adoptedCommand, idempotencyKey: 'adopt-pg-conflict' }, `sha256:${'1'.repeat(64)}`);
      await expect(repository.bind(conflicting.record.delegationId, { threadId: 'thread-existing-pg', sessionId: 'other-session' })).rejects.toThrow(/duplicate key|agent_delegation_host_thread_unique/i);
    } finally { await owner.end(); await fixture.close(); }
  });
});
