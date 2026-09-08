import { createHash } from 'node:crypto';
import {
  normalizeVisibilityObservation,
  type NormalizedVisibilityEvent,
} from '@codex/process';

export interface VisibilitySourceEvent {
  readonly sequence: string;
  readonly eventId: string;
  readonly streamId: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export function workflowVisibilityAgentId(
  runId: string,
  nodeId: string,
): string {
  return `agent:${createHash('sha256').update(`${runId}\0${nodeId}`).digest('hex')}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface AgentDisplay {
  title: string;
  phase: string;
  status: string;
}

/** Deterministic projection of existing durable events; never orchestration authority. */
export function createControlVisibilityProjector() {
  const titles = new Map<string, string>();
  const agents = new Map<string, AgentDisplay>();
  const sequences = new Map<string, bigint>();
  return (
    event: VisibilitySourceEvent,
  ): readonly NormalizedVisibilityEvent[] => {
    if (!event.streamId.startsWith('workflow:')) return [];
    const suffix = event.streamId.slice('workflow:'.length);
    const runId =
      typeof event.payload.runId === 'string'
        ? event.payload.runId
        : suffix.startsWith('workflow_')
          ? suffix
          : `workflow_${suffix}`;
    const base = {
      eventId: `source:${event.eventId}`,
      occurredAt: event.occurredAt,
      workflowId: runId,
      kind: event.kind,
    };
    const observation = record(event.payload.observation);
    const node = record(event.payload.node);
    const nodeId = node.id ?? event.payload.nodeId ?? observation.nodeId;
    const key =
      typeof nodeId === 'string'
        ? workflowVisibilityAgentId(runId, nodeId)
        : runId;
    if (BigInt(event.sequence) <= (sequences.get(key) ?? -1n)) return [];
    let candidate: unknown;
    if (
      typeof nodeId === 'string' &&
      (event.kind.startsWith('node.') ||
        event.kind === 'workflow.visibility.observed' ||
        event.kind === 'workflow.runtime.error')
    ) {
      const agentId = workflowVisibilityAgentId(runId, nodeId);
      const display = agents.get(agentId) ?? {
        title: nodeId,
        phase: 'Agents',
        status: 'queued',
      };
      if (typeof node.label === 'string') display.title = node.label;
      if (typeof node.phase === 'string') display.phase = node.phase;
      const status = {
        'node.started': 'running',
        'node.completed': 'completed',
        'node.failed': 'failed',
        'node.cancelled': 'cancelled',
      }[event.kind];
      if (status) display.status = status;
      agents.set(agentId, display);
      const stepId = `step:${createHash('sha256').update(display.phase).digest('hex')}`;
      candidate = {
        ...base,
        source: 'app-server',
        agentId,
        stepId,
        ...display,
        ...(event.kind === 'workflow.visibility.observed'
          ? {
              kind: observation.kind,
              itemId: observation.itemId,
              detail: observation.detail,
              item: observation.item,
            }
          : {}),
        ...(typeof event.payload.diagnostic === 'string'
          ? { errorText: event.payload.diagnostic }
          : {}),
      };
    } else {
      const status = {
        'workflow.accepted': 'queued',
        'workflow.started': 'running',
        'workflow.execution.started': 'running',
        'workflow.completed': 'completed',
        'workflow.failed': 'failed',
        'workflow.cancelled': 'cancelled',
      }[event.kind];
      if (!status) return [];
      const display = record(event.payload.display);
      if (typeof display.title === 'string') titles.set(runId, display.title);
      else if (typeof display.id === 'string')
        titles.set(
          runId,
          display.id
            .replace(/[._-]+/g, ' ')
            .replace(/^./, (letter) => letter.toUpperCase()),
        );
      // Legacy projection titles are immutable replay data; the UI owns friendly fallback.
      else if (typeof event.payload.workflowRef === 'string')
        titles.set(runId, event.payload.workflowRef);
      candidate = {
        ...base,
        source: 'workflow',
        status,
        title: titles.get(runId) ?? 'Workflow',
        ...(typeof event.payload.diagnostic === 'string'
          ? { errorText: event.payload.diagnostic }
          : {}),
      };
    }
    const normalized = normalizeVisibilityObservation(candidate);
    sequences.set(key, BigInt(event.sequence));
    return normalized ? [normalized] : [];
  };
}
