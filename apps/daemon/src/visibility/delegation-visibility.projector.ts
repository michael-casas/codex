import { createHash } from 'node:crypto';
import { normalizeVisibilityObservation } from '@codex/process';

export interface DelegationVisibilitySnapshot {
  readonly delegationId: string;
  readonly agentId: string;
  readonly status: string;
  readonly title: string;
  readonly occurredAt: string;
}

export function projectDelegationVisibility(
  snapshot: DelegationVisibilitySnapshot,
) {
  const digest = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
  const base = {
    eventId: `delegation:${digest}`,
    kind: 'delegation.snapshot',
    workflowId: `handoff:${snapshot.agentId}`,
    agentId: snapshot.agentId,
    stepId: 'handoff',
    phase: 'Direct handoff',
    status: snapshot.status,
    title: snapshot.title,
    occurredAt: snapshot.occurredAt,
  };
  return [
    normalizeVisibilityObservation({ ...base, source: 'delegation' }),
    normalizeVisibilityObservation({
      ...base,
      eventId: `handoff:${digest}`,
      source: 'workflow',
    }),
  ];
}
