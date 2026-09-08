import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { reconcileControlEvents } from '../control-cursor.js';
import { DurableControlError, type ControlEvent } from '../control-stream.js';

function event(sequence: bigint): ControlEvent {
  const payload = { sequence: Number(sequence) };
  return {
    streamId: 'workflow:alpha',
    sequence,
    eventId: `event-${sequence}`,
    idempotencyKey: `command-${sequence}`,
    kind: `step.${sequence}`,
    payload,
    payloadSha256: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
  };
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] durable control cursor reconciliation', () => {
  it('CAS03-L1-CURSOR closes the snapshot/listen race and deduplicates overlap', () => {
    const reconciled = reconcileControlEvents('1', [
      [event(1n), event(2n)],
      [event(2n), event(3n)],
      [event(3n), event(4n)],
    ]);

    expect(reconciled.map(({ sequence }) => sequence)).toEqual([2n, 3n, 4n]);
  });

  it('rejects an invalid cursor', () => {
    expect(() => reconcileControlEvents('-1', [[]])).toThrowError(
      expect.objectContaining<Partial<DurableControlError>>({
        code: 'CONTROL_CURSOR_INVALID',
      }),
    );
  });

  it('rejects conflicting events at one sequence', () => {
    expect(() =>
      reconcileControlEvents('0', [
        [event(1n)],
        [event(1n), { ...event(1n), eventId: 'other' }],
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<DurableControlError>>({
        code: 'CONTROL_CURSOR_CONFLICT',
      }),
    );
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
