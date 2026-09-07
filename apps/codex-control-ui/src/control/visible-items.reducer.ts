import type { VisibilityItem } from './types';

export function revision(value: string): bigint {
  if (!/^\d{1,30}$/.test(value)) throw Error('VISIBILITY_REVISION_INVALID');
  return BigInt(value);
}

function validItem(item: VisibilityItem, agentId: string): boolean {
  return (
    item !== null &&
    typeof item === 'object' &&
    item.agentId === agentId &&
    [item.id, item.threadId, item.turnId, item.itemId].every(
      (value) =>
        typeof value === 'string' && value.length > 0 && value.length <= 512,
    ) &&
    typeof item.body === 'string' &&
    ['message', 'tool', 'command', 'result'].includes(item.kind) &&
    ['streaming', 'completed', 'failed', 'interrupted', 'unknown'].includes(
      item.state,
    ) &&
    typeof item.revision === 'string' &&
    /^\d{1,30}$/.test(item.revision) &&
    (!item.fields ||
      (Array.isArray(item.fields) &&
        item.fields.every(
          (field) =>
            typeof field.name === 'string' &&
            (field.value === null ||
              ['string', 'number', 'boolean'].includes(typeof field.value)),
        )))
  );
}

/** Membership is a bounded backend snapshot; preserve order and newer local revisions. */
export function mergeVisibleItems(
  previous: readonly VisibilityItem[],
  incoming: readonly VisibilityItem[],
  agentId: string,
): readonly VisibilityItem[] {
  const admitted = incoming.filter((item) => validItem(item, agentId));
  const membership = new Set(admitted.map((item) => item.id));
  const items = new Map(
    previous
      .filter((item) => membership.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const item of admitted) {
    const existing = items.get(item.id);
    if (
      existing &&
      (existing.threadId !== item.threadId ||
        existing.turnId !== item.turnId ||
        existing.itemId !== item.itemId)
    )
      continue;
    if (
      existing &&
      existing.state !== 'streaming' &&
      item.state === 'streaming'
    )
      continue;
    if (!existing || revision(item.revision) > revision(existing.revision))
      items.set(item.id, item);
  }
  return [...items.values()].slice(-100);
}
