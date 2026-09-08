import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DurableControlError,
  reduceControlEvents,
  type ControlEvent,
} from '../control-stream.js';

function payloadSha256(
  payload: Readonly<Record<string, unknown>>,
): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function event(
  sequence: bigint,
  overrides: Partial<ControlEvent> = {},
): ControlEvent {
  const payload = overrides.payload ?? { sequence: Number(sequence) };
  return {
    streamId: 'workflow:alpha',
    sequence,
    eventId: `event-${sequence}`,
    idempotencyKey: `command-${sequence}`,
    kind: `step.${sequence}`,
    payload,
    payloadSha256: payloadSha256(payload),
    ...overrides,
  };
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] durable control stream reducer', () => {
  it('CAS03-L1-REDUCER deterministically reduces ordered events', () => {
    const events = [event(1n), event(2n)];

    const first = reduceControlEvents(events);
    const replay = reduceControlEvents(events);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      streamId: 'workflow:alpha',
      cursor: '2',
      eventCount: 2,
      lastEventKind: 'step.2',
    });
    expect(first.replaySha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    {
      name: 'non-monotonic sequence',
      events: [event(2n), event(1n)],
      code: 'CONTROL_EVENT_ORDER_INVALID',
    },
    {
      name: 'mixed stream identity',
      events: [event(1n), event(2n, { streamId: 'workflow:other' })],
      code: 'CONTROL_STREAM_CONFLICT',
    },
    {
      name: 'payload digest mismatch',
      events: [event(1n, { payloadSha256: `sha256:${'f'.repeat(64)}` })],
      code: 'CONTROL_EVENT_DIGEST_INVALID',
    },
    {
      name: 'conflicting idempotency replay',
      events: [event(1n), event(2n, { idempotencyKey: 'command-1' })],
      code: 'CONTROL_IDEMPOTENCY_CONFLICT',
    },
  ])('rejects $name', ({ events, code }) => {
    expect(() => reduceControlEvents(events)).toThrowError(
      expect.objectContaining<Partial<DurableControlError>>({ code }),
    );
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] durable control replay', () => {
  it('ignores an exact idempotent replay while advancing the durable cursor', () => {
    const original = event(1n);
    const replay = event(2n, {
      eventId: original.eventId,
      idempotencyKey: original.idempotencyKey,
      kind: original.kind,
      payload: original.payload,
      payloadSha256: original.payloadSha256,
    });

    expect(reduceControlEvents([original, replay])).toMatchObject({
      cursor: '2',
      eventCount: 1,
      lastEventKind: 'step.1',
    });
  });
});
