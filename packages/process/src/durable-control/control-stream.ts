export interface ControlEvent {
  readonly streamId: string;
  readonly sequence: bigint;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadSha256: `sha256:${string}`;
}

export interface ControlProjection {
  readonly streamId: string;
  readonly cursor: string;
  readonly eventCount: number;
  readonly lastEventKind: string | null;
  readonly replaySha256: `sha256:${string}`;
}

export class DurableControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DurableControlError';
  }
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new DurableControlError(
    'CONTROL_PAYLOAD_INVALID',
    'Control payloads must contain finite JSON values.',
  );
}

export function controlSha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sameReplay(left: ControlEvent, right: ControlEvent): boolean {
  return (
    left.streamId === right.streamId &&
    left.eventId === right.eventId &&
    left.kind === right.kind &&
    left.payloadSha256 === right.payloadSha256
  );
}

export function reduceControlEvents(
  events: readonly ControlEvent[],
): ControlProjection {
  if (events.length === 0) {
    return {
      streamId: '',
      cursor: '0',
      eventCount: 0,
      lastEventKind: null,
      replaySha256: controlSha256({
        cursor: '0',
        eventCount: 0,
        lastEventKind: null,
        streamId: '',
      }),
    };
  }

  const streamId = events[0]?.streamId ?? '';
  const accepted = new Map<string, ControlEvent>();
  let previousSequence = 0n;
  for (const event of events) {
    if (event.sequence <= previousSequence) {
      throw new DurableControlError(
        'CONTROL_EVENT_ORDER_INVALID',
        'Control event sequences must be strictly increasing.',
      );
    }
    previousSequence = event.sequence;
    if (event.streamId !== streamId) {
      throw new DurableControlError(
        'CONTROL_STREAM_CONFLICT',
        'One replay cannot mix control stream identities.',
      );
    }
    if (controlSha256(event.payload) !== event.payloadSha256) {
      throw new DurableControlError(
        'CONTROL_EVENT_DIGEST_INVALID',
        'The control event payload digest does not match its payload.',
      );
    }
    const prior = accepted.get(event.idempotencyKey);
    if (prior) {
      if (!sameReplay(prior, event)) {
        throw new DurableControlError(
          'CONTROL_IDEMPOTENCY_CONFLICT',
          'A conflicting control event reused an idempotency key.',
        );
      }
      continue;
    }
    accepted.set(event.idempotencyKey, event);
  }

  const last = [...accepted.values()].at(-1);
  const projectionBody = {
    streamId,
    cursor: previousSequence.toString(),
    eventCount: accepted.size,
    lastEventKind: last?.kind ?? null,
  };
  return {
    ...projectionBody,
    replaySha256: controlSha256(projectionBody),
  };
}
import { createHash } from 'node:crypto';
