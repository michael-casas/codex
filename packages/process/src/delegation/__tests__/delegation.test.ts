import { describe, expect, test } from 'vitest';

import * as api from '../../index.js';

const command = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: 'delegate-1', assignmentRef: 'CAS-06', assignmentDigest: `sha256:${'a'.repeat(64)}`, hostId: 'local',
  workspace: { repositoryId: 'codex', baseRevision: 'b'.repeat(40), assignmentId: 'CAS-06' },
  runtimeProfile: { model: 'gpt-5.6-sol', reasoningEffort: 'medium', sandbox: 'workspaceWrite', approvalPolicy: 'never' },
  completionBoundary: 'ready-for-audit', prompt: 'Implement the assignment.', ...overrides,
});

function fixture(active = true) {
  const calls: Array<[string, any]> = [], records = new Map<string, any>(), byKey = new Map<string, any>();
  const repository = {
    async reserve(input: any, fingerprint: string) {
      const prior = byKey.get(input.idempotencyKey);
      if (prior) { if (prior.fingerprint !== fingerprint) throw Object.assign(new Error('conflict'), { code: 'DELEGATION_IDEMPOTENCY_CONFLICT' }); return { record: prior, replayed: true }; }
      const record = { delegationId: 'delegation-1', executionId: 'execution-1', agentId: 'agent-1', state: 'reserved', fingerprint, command: input };
      records.set(record.delegationId, record); byKey.set(input.idempotencyKey, record); return { record, replayed: false };
    },
    async bind(id: string, binding: any) { Object.assign(records.get(id), binding, { state: 'running' }); return records.get(id); },
    async read(id: string) { return records.get(id); },
    async transition(id: string, state: string, activeTurnId?: string) { Object.assign(records.get(id), { state, activeTurnId }); return records.get(id); },
  };
  const connection = { async request(method: string, params: any) {
    calls.push([method, params]);
    if (method === 'thread/start') return { thread: { id: 'thread-local', sessionId: 'session-1' } };
    if (method === 'turn/start') return { turn: { id: 'turn-1' } };
    if (method === 'turn/steer') return { turnId: params.expectedTurnId };
    if (method === 'thread/resume') return { thread: { id: params.threadId, sessionId: 'session-1' } };
    if (method === 'thread/read') return { thread: { status: { type: active ? 'active' : 'idle' }, turns: [{ id: 'turn-1', status: active ? 'inProgress' : 'completed' }] } };
    return {};
  } };
  let releases = 0;
  const service = (api as any).createDelegationService?.({ repository,
    hosts: { connect: async (hostId: string) => { calls.push(['connect', hostId]); return connection; } },
    workspaces: { acquire: async (input: any) => { calls.push(['acquire', input]); return { workspaceRef: `workspace:${'c'.repeat(64)}` }; }, resolve: async () => ({ cwd: '/tmp/codex-local' }), release: async (ref: string) => { releases += 1; calls.push(['release', ref]); } },
  });
  return { calls, service, releases: () => releases };
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] direct agent handoff', () => {
  test('CAS-NET-GC1-004 rejects malformed network permission before lease or provider calls', async () => {
    const f = fixture();
    await expect(f.service.delegateAgent(command({ runtimeProfile: { ...command().runtimeProfile, networkAccess: 'false' } }))).rejects.toMatchObject({ code: 'DELEGATION_COMMAND_INVALID' });
    expect(f.calls).toEqual([]);
  });

  test('validates the one-call contract and keeps completion boundaries distinct', async () => {
    expect((api as any).createDelegationService, 'CAS-06 delegation behavior is not implemented').toBeTypeOf('function');
    const f = fixture();
    await expect(f.service.delegateAgent({ ...command(), rawPath: '/tmp/escape' })).rejects.toMatchObject({ code: 'DELEGATION_COMMAND_INVALID' });
    expect((api as any).reduceDelegationEvent('running', { type: 'turn/completed' }, 'ready-for-audit')).toBe('runtime-settled');
    expect((api as any).reduceDelegationEvent('running', { type: 'item/tool/requestUserInput' }, 'ready-for-audit')).toBe('blocked');
    expect((api as any).reduceDelegationEvent('runtime-settled', { type: 'output/validated' }, 'ready-for-audit')).toBe('output-validated');
    expect((api as any).reduceDelegationEvent('output-validated', { type: 'audit/ready' }, 'ready-for-audit')).toBe('ready-for-audit');
  });
  test('returns exact replay and rejects conflict before lease or provider calls', async () => {
    const f = fixture(), first = await f.service.delegateAgent(command()), before = f.calls.length;
    expect(await f.service.delegateAgent(command())).toEqual(first); expect(f.calls).toHaveLength(before);
    await expect(f.service.delegateAgent(command({ prompt: 'different' }))).rejects.toMatchObject({ code: 'DELEGATION_IDEMPOTENCY_CONFLICT' }); expect(f.calls).toHaveLength(before);
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] direct agent handoff', () => {
  test.each([['read-only', 'readOnly'], ['workspace-write', 'workspaceWrite'], ['danger-full-access', 'dangerFullAccess']])('normalizes existing sandbox alias %s for turn policy', async (sandbox, type) => {
    const f = fixture();
    await f.service.delegateAgent(command({ runtimeProfile: { ...command().runtimeProfile, sandbox } }));
    expect(f.calls.find(([name]) => name === 'turn/start')?.[1]).toMatchObject({ sandboxPolicy: { type } });
  });
  test('CAS-NET-GC1-004 freezes omitted network access as enabled on the initial turn', async () => {
    const f = fixture();
    const handle = await f.service.delegateAgent(command());
    const record = await f.service.readAgent(handle.delegationId);
    expect(record.command.runtimeProfile.networkAccess).toBe(true);
    expect(f.calls.find(([name]) => name === 'turn/start')?.[1]).toMatchObject({ sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/tmp/codex-local'], networkAccess: true, excludeTmpdirEnvVar: true, excludeSlashTmp: true } });
  });

  test('CAS-NET-GC1-004 preserves explicit denial on initial and resumed read-only turns', async () => {
    const f = fixture(false);
    const input = command({ runtimeProfile: { model: 'gpt-5.6-luna', reasoningEffort: 'high', sandbox: 'readOnly', approvalPolicy: 'never', networkAccess: false } });
    const handle = await f.service.delegateAgent(input);
    await f.service.continueAgent(handle.delegationId, 'Continue read-only.');
    const turns = f.calls.filter(([name]) => name === 'turn/start').map(([, params]) => params);
    expect(turns).toHaveLength(2);
    for (const turn of turns) expect(turn).toMatchObject({ sandboxPolicy: { type: 'readOnly', networkAccess: false } });
  });

  test('RP-DELEGATION forwards exact model/effort on initial and idle continuation without replay', async () => {
    const f = fixture(false);
    const input = command({ runtimeProfile: { model: 'gpt-5.6-luna', reasoningEffort: 'high', sandbox: 'readOnly', approvalPolicy: 'never' } });
    const handle = await f.service.delegateAgent(input);
    await f.service.delegateAgent(input);
    await f.service.continueAgent(handle.delegationId, 'Continue read-only.');
    const turns = f.calls.filter(([name]) => name === 'turn/start').map(([, params]) => params);
    expect(turns).toHaveLength(2);
    for (const turn of turns) expect(turn).toMatchObject({ model: 'gpt-5.6-luna', effort: 'high' });
    const before = f.calls.length;
    await expect(f.service.delegateAgent(command({ runtimeProfile: { ...input.runtimeProfile, reasoningEffort: 'low' } }))).rejects.toMatchObject({ code: 'DELEGATION_IDEMPOTENCY_CONFLICT' });
    expect(f.calls).toHaveLength(before);
  });
  test('owns thread and turn start and returns the compact stable handle', async () => {
    const f = fixture();
    expect(await f.service.delegateAgent(command())).toEqual({ delegationId: 'delegation-1', executionId: 'execution-1', agentId: 'agent-1', hostId: 'local', threadId: 'thread-local' });
    expect(f.calls.map(([name]) => name)).toEqual(['acquire', 'connect', 'thread/start', 'turn/start']);
  });
  test('continues the bound active turn and cancels only that turn once', async () => {
    const f = fixture(), handle = await f.service.delegateAgent(command());
    await f.service.continueAgent(handle.delegationId, 'Focus on tests.'); await f.service.cancelAgent(handle.delegationId); await f.service.cancelAgent(handle.delegationId);
    expect(f.calls.filter(([name]) => name === 'turn/steer')).toHaveLength(1); expect(f.calls.filter(([name]) => name === 'turn/interrupt')).toHaveLength(1); expect(f.releases()).toBe(1);
  });
});
