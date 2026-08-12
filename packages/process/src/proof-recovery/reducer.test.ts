import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ProcessEvent } from './contracts.js';
import { maySubmitProcessEvent } from './policy.js';
import { reduceCandidateEvents } from './reducer.js';

const candidateDigest = `sha256:${'a'.repeat(64)}` as const;

function event(
  sequence: number,
  kind: ProcessEvent['kind'],
  actorRole: ProcessEvent['actorRole'],
  idempotencyKey: string,
  payload: Record<string, unknown>,
): ProcessEvent {
  return {
    sequence,
    kind,
    actorRole,
    idempotencyKey,
    candidateDigest,
    payload,
    payloadDigest: `sha256:${createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')}`,
  };
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] deterministic proof reducer', () => {
  it('PR1-L1-001 derives the same registered projection on replay', () => {
    const events = [
      event(1, 'candidate.registered', 'coordinator', 'candidate:1', {
        pathCount: 160,
      }),
    ];
    const first = reduceCandidateEvents(events);
    const replay = reduceCandidateEvents(events);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ candidateDigest, state: 'registered' });
    expect(first.replayDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('PR1-L1-002 ignores exact duplicate delivery and rejects conflicting reuse', () => {
    const original = event(
      1,
      'candidate.registered',
      'coordinator',
      'candidate:1',
      { pathCount: 160 },
    );
    expect(reduceCandidateEvents([original, { ...original, sequence: 2 }])).toEqual(
      reduceCandidateEvents([original]),
    );
    const conflict = event(
      2,
      'candidate.registered',
      'coordinator',
      'candidate:1',
      { pathCount: 159 },
    );
    expect(() => reduceCandidateEvents([original, conflict])).toThrow(
      /idempotency/i,
    );
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] scoped process role policy', () => {
  it('PR1-L1-004 grants only role-owned submissions', () => {
    expect(maySubmitProcessEvent('coordinator', 'candidate.registered')).toBe(true);
    expect(maySubmitProcessEvent('preflight', 'artifact.registered')).toBe(true);
    expect(maySubmitProcessEvent('preflight', 'preflight.submitted')).toBe(true);
    expect(maySubmitProcessEvent('judge', 'verdict.submitted')).toBe(true);
    expect(maySubmitProcessEvent('worker', 'preflight.submitted')).toBe(false);
    expect(maySubmitProcessEvent('coordinator', 'verdict.submitted')).toBe(false);
  });
});
