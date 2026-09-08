import type { ControlEvent } from './control-stream.js';
import { DurableControlError } from './control-stream.js';

function cursor(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new DurableControlError(
      'CONTROL_CURSOR_INVALID',
      'A control cursor must be a nonnegative decimal integer.',
    );
  }
  return BigInt(value);
}

function sameEvent(left: ControlEvent, right: ControlEvent): boolean {
  return (
    left.streamId === right.streamId &&
    left.eventId === right.eventId &&
    left.idempotencyKey === right.idempotencyKey &&
    left.kind === right.kind &&
    left.payloadSha256 === right.payloadSha256
  );
}

export function reconcileControlEvents(
  afterCursor: string,
  batches: readonly (readonly ControlEvent[])[],
): readonly ControlEvent[] {
  const after = cursor(afterCursor);
  const bySequence = new Map<bigint, ControlEvent>();
  for (const batch of batches) {
    for (const event of batch) {
      if (event.sequence <= after) continue;
      const prior = bySequence.get(event.sequence);
      if (prior && !sameEvent(prior, event)) {
        throw new DurableControlError(
          'CONTROL_CURSOR_CONFLICT',
          'One control sequence resolved to conflicting events.',
        );
      }
      bySequence.set(event.sequence, event);
    }
  }
  return [...bySequence.values()].sort((left, right) =>
    left.sequence < right.sequence
      ? -1
      : left.sequence > right.sequence
        ? 1
        : 0,
  );
}
