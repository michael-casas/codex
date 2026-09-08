import { createHash } from 'node:crypto';
import {
  normalizeVisibleItem,
  type VisibleItemUpdate,
  type VisibleItem,
} from './visible-item.reducer.js';
import { redactVisibilityText as redact } from './visibility-text.policy.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const KIND = /^[a-z][a-z0-9.-]{0,127}$/;
const MAX_DETAIL_BYTES = 4_096;
const MAX_WAIT_MS = 30_000;

export type VisibilitySource =
  | 'app-server'
  | 'workflow'
  | 'delegation'
  | 'message';
export type VisibilityDetailType = 'message' | 'command' | 'tool';
export type VisibilityStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'offline'
  | 'unknown';

export interface VisibilityDetail {
  readonly type: VisibilityDetailType;
  readonly body: string;
  readonly truncated: boolean;
  readonly originalBytes: number;
}

export interface NormalizedVisibilityEvent {
  readonly eventId: string;
  readonly source: VisibilitySource;
  readonly kind: string;
  readonly occurredAt: string;
  readonly authoritative: boolean;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly stepId?: string;
  readonly agentId?: string;
  readonly itemId?: string;
  readonly status?: VisibilityStatus;
  readonly stateText?: string;
  readonly errorText?: string;
  readonly title?: string;
  readonly phase?: string;
  readonly current?: number;
  readonly total?: number;
  readonly detail?: VisibilityDetail;
  readonly item?: VisibleItemUpdate;
}

export interface VisibilitySelection {
  readonly selectedAgentId?: string;
  readonly selectionId?: string;
}

export type VisibilityQuery = VisibilitySelection;

export interface WaitVisibilityQuery extends VisibilitySelection {
  readonly afterCursor: string;
  readonly waitMs: number;
}

export interface VisibilitySummary {
  readonly source: VisibilitySource;
  readonly id: string;
  readonly cursor: string;
  readonly authoritative: boolean;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly stepId?: string;
  readonly agentId?: string;
  readonly status?: VisibilityStatus;
  readonly stateText?: string;
  readonly errorText?: string;
  readonly title?: string;
  readonly phase?: string;
  readonly current?: number;
  readonly total?: number;
}

export interface VisibilityResult extends VisibilitySelection {
  readonly cursor: string;
  readonly changed: boolean;
  readonly evaluationLimits?: {
    readonly itemBytes: number;
    readonly logicalItems: number;
    readonly aggregateBytes: number;
    readonly permanent: false;
  };
  readonly summaries?: readonly VisibilitySummary[];
  readonly summariesTruncated?: boolean;
  readonly appearance?: 'host';
  readonly feed?:
    | { readonly state: 'collapsed' }
    | {
        readonly state: 'selected';
        readonly agentId: string;
        readonly selectionId?: string;
      };
  readonly workflows?: readonly VisibilityWorkflow[];
  readonly details?: {
    readonly agentId: string;
    readonly truncated: boolean;
    readonly events: readonly NormalizedVisibilityEvent[];
    readonly items?: readonly VisibleItem[];
  };
}

export interface VisibilityAgent {
  readonly id: string;
  readonly label: string;
  readonly status: VisibilityStatus;
  readonly stateText: string;
  readonly errorText?: string;
}

export interface VisibilityStep {
  readonly id: string;
  readonly label: string;
  readonly progressLabel?: string;
  readonly agents: readonly VisibilityAgent[];
}

export interface VisibilityWorkflow {
  readonly id: string;
  readonly label: string;
  readonly status: VisibilityStatus;
  readonly stateText: string;
  readonly errorText?: string;
  readonly progressLabel?: string;
  readonly steps: readonly VisibilityStep[];
}

export interface RuntimeVisibilityRepository {
  ingest(event: NormalizedVisibilityEvent): Promise<string>;
  snapshot(query?: VisibilityQuery): Promise<VisibilityResult>;
  wait(
    query: WaitVisibilityQuery,
    signal?: AbortSignal,
  ): Promise<VisibilityResult>;
}

export class RuntimeVisibilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimeVisibilityError';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalId(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      `${name} is invalid.`,
    );
  }
  return value;
}

function boundedNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      `${name} is invalid.`,
    );
  }
  return value as number;
}

function truncate(value: string, maximum: number): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maximum) return value;
  let end = maximum;
  let bounded = bytes.subarray(0, end).toString('utf8');
  while (Buffer.byteLength(bounded, 'utf8') > maximum) {
    end -= 1;
    bounded = bytes.subarray(0, end).toString('utf8');
  }
  return bounded;
}

function safeText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      `${name} is invalid.`,
    );
  }
  return truncate(redact(value), 512);
}

function readable(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function semanticStatus(value: string | undefined): VisibilityStatus {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) return 'unknown';
  if (['queued', 'reserved', 'accepted'].includes(normalized)) return 'queued';
  if (['leased', 'running', 'inprogress', 'active'].includes(normalized))
    return 'running';
  if (['blocked', 'waitingonapproval', 'ambiguous'].includes(normalized))
    return 'blocked';
  if (
    [
      'completed',
      'appserveraccepted',
      'threadobserved',
      'replied',
      'runtimesettled',
      'outputvalidated',
      'readyforaudit',
    ].includes(normalized)
  )
    return 'completed';
  if (['failed', 'expired', 'declined'].includes(normalized)) return 'failed';
  if (['cancelled', 'canceled', 'interrupted'].includes(normalized))
    return 'cancelled';
  if (['offline', 'disconnected', 'notloaded'].includes(normalized))
    return 'offline';
  return 'unknown';
}

function statusText(
  value: string | undefined,
  status: VisibilityStatus,
): string {
  if (value === 'thread-observed') return 'Message observed';
  if (value === 'app-server-accepted') return 'Message accepted';
  if (value === 'waitingOnApproval') return 'Waiting for approval';
  return status === 'unknown' && value ? readable(value) : readable(status);
}

function safeDetail(value: unknown): VisibilityDetail | undefined {
  if (value === undefined) return undefined;
  if (!object(value) || typeof value.type !== 'string') {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility detail is invalid.',
    );
  }
  if (value.type === 'reasoning') return undefined;
  if (!['message', 'command', 'tool'].includes(value.type)) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility detail type is invalid.',
    );
  }
  if (typeof value.body !== 'string') {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility detail body is invalid.',
    );
  }
  const redacted = redact(value.body);
  const originalBytes = Buffer.byteLength(redacted, 'utf8');
  return {
    type: value.type as VisibilityDetailType,
    body: truncate(redacted, MAX_DETAIL_BYTES),
    truncated: originalBytes > MAX_DETAIL_BYTES,
    originalBytes,
  };
}

export function normalizeVisibilityObservation(
  value: unknown,
): NormalizedVisibilityEvent | null {
  if (!object(value)) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility observation must be an object.',
    );
  }
  if (
    typeof value.eventId !== 'string' ||
    !ID.test(value.eventId) ||
    typeof value.kind !== 'string' ||
    !KIND.test(value.kind) ||
    typeof value.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    !['app-server', 'workflow', 'delegation', 'message'].includes(
      String(value.source),
    )
  ) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility observation identity is invalid.',
    );
  }
  if (
    value.kind.includes('reasoning') ||
    (object(value.detail) && value.detail.type === 'reasoning')
  ) {
    return null;
  }
  const source = value.source as VisibilitySource;
  const projectId = optionalId(value.projectId, 'projectId');
  const workflowId = optionalId(value.workflowId, 'workflowId');
  const stepId = optionalId(value.stepId, 'stepId');
  const agentId = optionalId(value.agentId, 'agentId');
  const itemId = optionalId(value.itemId, 'itemId');
  if (source === 'workflow' && !workflowId) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Workflow observations require workflowId.',
    );
  }
  if (source !== 'workflow' && !agentId && !projectId) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_EVENT_INVALID',
      'Visibility observations require agent or project attribution.',
    );
  }
  const detail = safeDetail(value.detail);
  const item = normalizeVisibleItem(value.item, agentId);
  if (item && item.itemId !== itemId)
    throw new RuntimeVisibilityError(
      'VISIBILITY_ITEM_INVALID',
      'Item identity mismatch.',
    );
  const rawStatus = safeText(value.status, 'status');
  const status = semanticStatus(rawStatus);
  const title = safeText(value.title, 'title');
  const phase = safeText(value.phase, 'phase');
  const stateText = safeText(value.stateText, 'stateText');
  const errorText = safeText(value.errorText, 'errorText');
  const current = boundedNumber(value.current, 'current');
  const total = boundedNumber(value.total, 'total');
  return {
    eventId: value.eventId,
    source,
    kind: value.kind,
    occurredAt: new Date(value.occurredAt).toISOString(),
    authoritative:
      value.kind === 'item.completed' ||
      value.kind === 'turn.completed' ||
      !value.kind.endsWith('.delta'),
    ...(projectId ? { projectId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(stepId ? { stepId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(itemId ? { itemId } : {}),
    ...(rawStatus
      ? { status, stateText: stateText ?? statusText(rawStatus, status) }
      : {}),
    ...(title ? { title } : {}),
    ...(phase ? { phase } : {}),
    ...(errorText ? { errorText } : {}),
    ...(current !== undefined ? { current } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(detail ? { detail } : {}),
    ...(item ? { item } : {}),
  };
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new RuntimeVisibilityError(
    'VISIBILITY_EVENT_INVALID',
    'Visibility events must contain finite JSON values.',
  );
}

export function runtimeVisibilitySha256(
  event: NormalizedVisibilityEvent,
): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(event)).digest('hex')}`;
}

function label(value: string): string {
  return readable(value.replace(/:/g, ' '));
}

function selectionFields(value: VisibilitySelection): VisibilitySelection {
  return {
    ...(value.selectedAgentId
      ? { selectedAgentId: value.selectedAgentId }
      : {}),
    ...(value.selectionId ? { selectionId: value.selectionId } : {}),
  };
}

export function shapeVisibilityResult(input: {
  readonly cursor: string;
  readonly changed: boolean;
  readonly summaries: readonly VisibilitySummary[];
  readonly summariesTruncated?: boolean;
  readonly selectedAgentId?: string;
  readonly selectionId?: string;
  readonly details?: VisibilityResult['details'];
}): VisibilityResult {
  const workflows = new Map<
    string,
    {
      summary?: VisibilitySummary;
      steps: Map<string, Map<string, VisibilitySummary>>;
    }
  >();
  for (const summary of input.summaries) {
    const workflowId =
      summary.workflowId ??
      (summary.source === 'workflow' ? summary.id : undefined);
    if (!workflowId) continue;
    const workflow: {
      summary?: VisibilitySummary;
      steps: Map<string, Map<string, VisibilitySummary>>;
    } = workflows.get(workflowId) ?? {
      steps: new Map<string, Map<string, VisibilitySummary>>(),
    };
    if (summary.source === 'workflow') workflow.summary = summary;
    const stepId = summary.stepId ?? summary.phase;
    if (stepId && summary.agentId) {
      const agents = workflow.steps.get(stepId) ?? new Map();
      agents.set(summary.agentId, summary);
      workflow.steps.set(stepId, agents);
    }
    workflows.set(workflowId, workflow);
  }
  return {
    cursor: input.cursor,
    changed: input.changed,
    summaries: input.summaries,
    ...(input.summariesTruncated ? { summariesTruncated: true } : {}),
    appearance: 'host',
    feed: input.selectedAgentId
      ? {
          state: 'selected',
          agentId: input.selectedAgentId,
          ...(input.selectionId ? { selectionId: input.selectionId } : {}),
        }
      : { state: 'collapsed' },
    workflows: [...workflows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, workflow]) => {
        const summary = workflow.summary;
        const status = summary?.status ?? 'unknown';
        const agents = [...workflow.steps.values()].flatMap((step) => [
          ...step.values(),
        ]);
        const completed = agents.filter(
          (agent) => agent.status === 'completed',
        ).length;
        return {
          id,
          label: summary?.title ?? label(id),
          status,
          stateText: summary?.stateText ?? statusText(undefined, status),
          ...(summary?.errorText ? { errorText: summary.errorText } : {}),
          ...(summary?.current !== undefined && summary.total !== undefined
            ? { progressLabel: `${summary.current} of ${summary.total}` }
            : agents.length
              ? {
                  progressLabel: `${completed}/${agents.length} agents completed`,
                }
              : {}),
          steps: [...workflow.steps.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([stepId, agents]) => ({
              id: stepId,
              label: [...agents.values()][0]?.phase ?? label(stepId),
              progressLabel: `${[...agents.values()].filter((agent) => agent.status === 'completed').length}/${agents.size} agents completed`,
              agents: [...agents.values()]
                .sort((left, right) =>
                  (left.agentId ?? '').localeCompare(right.agentId ?? ''),
                )
                .map((agent) => ({
                  id: agent.agentId ?? agent.id,
                  label: agent.title ?? label(agent.agentId ?? agent.id),
                  status: agent.status ?? 'unknown',
                  stateText:
                    agent.stateText ??
                    statusText(undefined, agent.status ?? 'unknown'),
                  ...(agent.errorText ? { errorText: agent.errorText } : {}),
                })),
            })),
        };
      }),
    ...selectionFields(input),
    ...(input.details ? { details: input.details } : {}),
  };
}

function validateSelection(value: VisibilitySelection): void {
  if (
    (value.selectedAgentId !== undefined && !ID.test(value.selectedAgentId)) ||
    (value.selectionId !== undefined && !ID.test(value.selectionId)) ||
    (value.selectionId !== undefined && value.selectedAgentId === undefined)
  ) {
    throw new RuntimeVisibilityError(
      'VISIBILITY_QUERY_INVALID',
      'Visibility selection is invalid.',
    );
  }
}

export function acceptVisibilityResult(
  current: VisibilitySelection,
  result: VisibilityResult,
): boolean {
  if (result.selectedAgentId === undefined && result.selectionId === undefined)
    return current.selectedAgentId === undefined;
  return (
    current.selectedAgentId === result.selectedAgentId &&
    current.selectionId === result.selectionId
  );
}

export function createRuntimeVisibilityService(
  repository: Pick<RuntimeVisibilityRepository, 'snapshot' | 'wait'>,
) {
  return {
    snapshot(query: VisibilityQuery = {}) {
      validateSelection(query);
      return repository.snapshot(query);
    },
    async wait(query: WaitVisibilityQuery, signal?: AbortSignal) {
      validateSelection(query);
      if (
        !/^(0|[1-9]\d*)$/.test(query.afterCursor) ||
        !Number.isInteger(query.waitMs) ||
        query.waitMs < 0 ||
        query.waitMs > MAX_WAIT_MS
      ) {
        throw new RuntimeVisibilityError(
          'VISIBILITY_QUERY_INVALID',
          'Visibility wait cursor or duration is invalid.',
        );
      }
      return repository.wait(query, signal);
    },
  };
}

export function createRuntimeVisibilityIngestor(
  repository: Pick<RuntimeVisibilityRepository, 'ingest'>,
  options: {
    readonly coalesceIntervalMs?: number;
    readonly maxCoalescedBytes?: number;
  } = {},
) {
  const interval = options.coalesceIntervalMs ?? 50;
  const maximum = options.maxCoalescedBytes ?? MAX_DETAIL_BYTES;
  const pending = new Map<
    string,
    { event: NormalizedVisibilityEvent; eventIds: string[] }
  >();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();
  let backgroundFailure: unknown;

  const persist = (events: readonly NormalizedVisibilityEvent[]) => {
    writes = writes.then(async () => {
      for (const event of events) await repository.ingest(event);
    });
    return writes;
  };

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const entries = [...pending.values()];
    pending.clear();
    await persist(
      entries.map(({ event, eventIds }) => ({
        ...event,
        eventId: `coalesced:${createHash('sha256')
          .update(eventIds.join('\n'))
          .digest('hex')}`,
      })),
    );
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      void flush().catch((error) => {
        backgroundFailure = error;
      });
    }, interval);
    timer.unref?.();
  };

  return {
    async observe(value: unknown): Promise<void> {
      if (backgroundFailure) throw backgroundFailure;
      const event = normalizeVisibilityObservation(value);
      if (!event) return;
      const isDelta = event.kind.endsWith('.delta');
      if (!isDelta || !event.detail || !event.agentId || !event.itemId) {
        if (!isDelta && event.agentId && event.itemId) await flush();
        await persist([event]);
        return;
      }
      const key = `${event.agentId}:${event.item?.turnId ?? ''}:${event.itemId}:${event.detail.type}`;
      const prior = pending.get(key);
      const body = `${prior?.event.detail?.body ?? ''}${event.detail.body}`;
      const originalBytes = Buffer.byteLength(body, 'utf8');
      pending.set(key, {
        event: {
          ...(prior?.event ?? event),
          occurredAt: event.occurredAt,
          detail: {
            type: event.detail.type,
            body: truncate(body, maximum),
            truncated: originalBytes > maximum,
            originalBytes,
          },
          ...(event.item
            ? {
                item: normalizeVisibleItem(
                  {
                    ...event.item,
                    body: (prior?.event.item?.body ?? '') + event.item.body,
                    originalBytes:
                      (prior?.event.item?.originalBytes ?? 0) +
                      event.item.originalBytes,
                    truncated:
                      event.item.truncated ||
                      prior?.event.item?.truncated === true,
                  },
                  event.agentId,
                ),
              }
            : {}),
        },
        eventIds: [...(prior?.eventIds ?? []), event.eventId],
      });
      if (originalBytes >= maximum) await flush();
      else schedule();
    },
    flush,
    async stop(): Promise<void> {
      await flush();
      if (backgroundFailure) throw backgroundFailure;
    },
  };
}
