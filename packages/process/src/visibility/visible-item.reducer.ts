import { createHash } from 'node:crypto';
import type { NormalizedVisibilityEvent } from './runtime-visibility.service.js';
import { redactVisibilityText } from './visibility-text.policy.js';

/** Evaluation projection limits, not a permanent retention/history policy. */
export const VISIBILITY_EVALUATION_LIMITS = Object.freeze({
  itemBytes: 65_536,
  logicalItems: 100,
  aggregateBytes: 2_097_152,
  permanent: false as const,
});
export interface VisibleResultField {
  readonly name: string;
  readonly value: string | number | boolean | null;
}
export interface VisibleItemUpdate {
  readonly id: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly itemType: string;
  readonly operation: 'append' | 'replace' | 'status' | 'result';
  readonly messagePhase: 'commentary' | 'final_answer' | null;
  readonly body: string;
  readonly originalBytes: number;
  readonly truncated: boolean;
  readonly status?: string;
  readonly fields?: readonly VisibleResultField[];
  readonly schemaDigest?: string;
}
export interface VisibleItem {
  readonly id: string;
  readonly agentId: string;
  readonly workflowId?: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly itemType: string;
  readonly kind: 'message' | 'tool' | 'result';
  readonly state:
    | 'streaming'
    | 'completed'
    | 'failed'
    | 'interrupted'
    | 'unknown';
  readonly body: string;
  readonly fields?: readonly VisibleResultField[];
  readonly schemaDigest?: string;
  readonly messagePhase: 'commentary' | 'final_answer' | null;
  readonly revision: string;
  readonly firstRevision: string;
  readonly firstSeenAt: string;
  readonly updatedAt: string;
  readonly truncated: boolean;
  readonly originalBytes: number;
  readonly evaluation: true;
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function invalid(): never {
  throw Object.assign(new Error('Invalid visible item.'), {
    code: 'VISIBILITY_ITEM_INVALID',
  });
}
function limit(text: string, bytes: number): string {
  return new TextDecoder().decode(
    Buffer.from(text).subarray(0, Math.max(0, bytes)),
    { stream: true },
  );
}
export function normalizeVisibleItem(
  value: unknown,
  agentId: string | undefined,
): VisibleItemUpdate | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !agentId ||
    !['threadId', 'turnId', 'itemId', 'itemType'].every(
      (key) => typeof value[key] === 'string' && ID.test(String(value[key])),
    )
  )
    invalid();
  if (value.itemType === 'reasoning') return undefined;
  if (
    !['append', 'replace', 'status', 'result'].includes(String(value.operation))
  )
    invalid();
  if (value.body !== undefined && typeof value.body !== 'string') invalid();
  const raw = redactVisibilityText(String(value.body ?? ''));
  let originalBytes = Buffer.byteLength(raw);
  const body = limit(raw, VISIBILITY_EVALUATION_LIMITS.itemBytes);
  let budget = VISIBILITY_EVALUATION_LIMITS.itemBytes - Buffer.byteLength(body);
  let truncated =
    value.truncated === true || originalBytes > Buffer.byteLength(body);
  let fields: VisibleResultField[] | undefined;
  if (value.operation === 'result') {
    if (
      typeof value.schemaDigest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(value.schemaDigest) ||
      !Array.isArray(value.fields)
    )
      invalid();
    fields = [];
    for (const candidate of value.fields) {
      if (
        !isRecord(candidate) ||
        typeof candidate.name !== 'string' ||
        candidate.name.length > 256
      )
        invalid();
      if (/token|password|secret|credential|api[_-]?key/i.test(candidate.name))
        continue;
      const scalar = candidate.value;
      if (
        scalar !== null &&
        !['string', 'number', 'boolean'].includes(typeof scalar)
      )
        invalid();
      if (typeof scalar === 'number' && !Number.isFinite(scalar)) invalid();
      const name = redactVisibilityText(candidate.name);
      const safe =
        typeof scalar === 'string'
          ? redactVisibilityText(scalar)
          : (scalar as number | boolean | null);
      const bytes = Buffer.byteLength(name) + Buffer.byteLength(String(safe));
      originalBytes += bytes;
      if (fields.length >= 40 || budget < Buffer.byteLength(name)) {
        truncated = true;
        continue;
      }
      const bounded =
        typeof safe === 'string'
          ? limit(safe, budget - Buffer.byteLength(name))
          : safe;
      const retained =
        Buffer.byteLength(name) + Buffer.byteLength(String(bounded));
      if (retained > budget) {
        truncated = true;
        continue;
      }
      fields.push({ name, value: bounded });
      budget -= retained;
      if (retained < bytes) truncated = true;
    }
  }
  if (
    Number.isSafeInteger(value.originalBytes) &&
    Number(value.originalBytes) >= originalBytes
  )
    originalBytes = Number(value.originalBytes);
  const threadId = String(value.threadId),
    turnId = String(value.turnId),
    itemId = String(value.itemId);
  return {
    id: `item:${createHash('sha256')
      .update(JSON.stringify([agentId, threadId, turnId, itemId]))
      .digest('hex')}`,
    threadId,
    turnId,
    itemId,
    itemType: String(value.itemType),
    operation: value.operation as VisibleItemUpdate['operation'],
    messagePhase:
      value.messagePhase === 'commentary' ||
      value.messagePhase === 'final_answer'
        ? value.messagePhase
        : null,
    body,
    originalBytes,
    truncated,
    ...(typeof value.status === 'string'
      ? { status: value.status.slice(0, 64) }
      : {}),
    ...(fields ? { fields, schemaDigest: String(value.schemaDigest) } : {}),
  };
}
export function reduceVisibleItem(
  previous: VisibleItem | undefined,
  event: NormalizedVisibilityEvent | null,
  revision: string,
): VisibleItem {
  const update = event?.item;
  if (!event || !event.agentId || !update || !/^[1-9]\d*$/.test(revision))
    invalid();
  if (previous && previous.id !== update.id) invalid();
  if (previous && BigInt(previous.revision) >= BigInt(revision))
    return previous;
  if (
    previous &&
    ['completed', 'failed', 'interrupted'].includes(previous.state) &&
    update.operation === 'append'
  )
    return previous;
  const appending = update.operation === 'append';
  const replacing =
    update.operation === 'replace' || update.operation === 'result';
  const raw = redactVisibilityText(
    appending
      ? (previous?.body ?? '') + update.body
      : replacing
        ? update.body
        : (previous?.body ?? update.body),
  );
  const body = limit(raw, VISIBILITY_EVALUATION_LIMITS.itemBytes);
  const originalBytes = appending
    ? (previous?.originalBytes ?? 0) + update.originalBytes
    : replacing
      ? update.originalBytes
      : (previous?.originalBytes ?? update.originalBytes);
  const state: VisibleItem['state'] =
    update.status === 'failed'
      ? 'failed'
      : update.status === 'interrupted'
        ? 'interrupted'
        : replacing || update.status === 'completed'
          ? 'completed'
          : appending || update.status === 'inProgress'
            ? 'streaming'
            : 'unknown';
  return {
    id: update.id,
    agentId: event.agentId,
    ...(event.workflowId ? { workflowId: event.workflowId } : {}),
    threadId: update.threadId,
    turnId: update.turnId,
    itemId: update.itemId,
    itemType: update.itemType,
    kind:
      update.operation === 'result'
        ? 'result'
        : previous?.kind === 'result'
          ? 'result'
          : update.itemType === 'agentMessage'
            ? 'message'
            : 'tool',
    state,
    body,
    ...(update.fields
      ? { fields: update.fields, schemaDigest: update.schemaDigest }
      : previous?.fields
        ? { fields: previous.fields, schemaDigest: previous.schemaDigest }
        : {}),
    messagePhase: update.messagePhase ?? previous?.messagePhase ?? null,
    revision,
    firstRevision: previous?.firstRevision ?? revision,
    firstSeenAt: previous?.firstSeenAt ?? event.occurredAt,
    updatedAt: event.occurredAt,
    truncated:
      update.truncated ||
      (!replacing && previous?.truncated === true) ||
      Buffer.byteLength(raw) > Buffer.byteLength(body),
    originalBytes,
    evaluation: true,
  };
}
