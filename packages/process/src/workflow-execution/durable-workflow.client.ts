import { createHash } from 'node:crypto';

export type DurableWorkflowState =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DurableWorkflowRunHandle {
  readonly runId: string;
  readonly state: DurableWorkflowState;
  readonly cursor: string;
}

export interface DurableWorkflowObservation extends DurableWorkflowRunHandle {
  readonly changed: boolean;
  readonly cancellationRequested: boolean;
  readonly result?: unknown;
  readonly nodes?: readonly unknown[];
  readonly artifacts?: readonly unknown[];
}

export interface DurableWorkflowEvent {
  readonly sequence: bigint;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DurableWorkflowControlCommand {
  readonly commandId: string;
  readonly streamId: string;
  readonly idempotencyKey: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly events: readonly {
    readonly eventId: string;
    readonly kind: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }[];
  readonly delivery?: {
    readonly queue: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly retryLimit: number;
    readonly retryDelaySeconds: number;
    readonly retryBackoff: boolean;
    readonly expireInSeconds: number;
    readonly deadLetter?: string;
  };
}

export interface DurableWorkflowControlStore {
  execute(command: DurableWorkflowControlCommand): Promise<{
    readonly commandId: string;
    readonly cursor: string;
    readonly replayed: boolean;
  }>;
  events(
    streamId: string,
    afterCursor: string,
  ): Promise<readonly DurableWorkflowEvent[]>;
}

export interface PreparedDurableWorkflowRun {
  readonly runId: string;
  readonly streamId: string;
  readonly requestFingerprint: string;
  readonly command: unknown;
}

export interface DurableWorkflowClientDependencies {
  readonly store: DurableWorkflowControlStore;
  readonly prepare: (command: unknown) => PreparedDurableWorkflowRun;
}

export class DurableWorkflowClientError extends Error {
  override readonly name = 'DurableWorkflowClientError';

  constructor(
    readonly code:
      | 'WORKFLOW_CURSOR_INVALID'
      | 'WORKFLOW_PREPARATION_INVALID'
      | 'WORKFLOW_RUN_ID_INVALID'
      | 'WORKFLOW_RUN_NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

const RUN_ID = /^workflow_[a-f0-9]{64}$/;
const CURSOR = /^(0|[1-9]\d*)$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function uuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function runIdentity(runId: string): {
  runId: string;
  commandStreamId: string;
  runtimeStreamId: string;
} {
  if (!RUN_ID.test(runId)) {
    throw new DurableWorkflowClientError(
      'WORKFLOW_RUN_ID_INVALID',
      'WORKFLOW_RUN_ID_INVALID',
    );
  }
  return {
    runId,
    commandStreamId: `workflow:${runId.slice('workflow_'.length)}`,
    runtimeStreamId: `workflow:${runId}`,
  };
}

function cursor(value: string): bigint {
  if (!CURSOR.test(value)) {
    throw new DurableWorkflowClientError(
      'WORKFLOW_CURSOR_INVALID',
      'WORKFLOW_CURSOR_INVALID',
    );
  }
  return BigInt(value);
}

function preparedRun(value: PreparedDurableWorkflowRun): {
  runId: string;
  streamId: string;
  requestFingerprint: `sha256:${string}`;
  command: Record<string, unknown>;
  idempotencyKey: string;
} {
  const identity = runIdentity(value.runId);
  const command = record(value.command);
  const idempotencyKey = command?.idempotencyKey;
  if (
    value.streamId !== identity.commandStreamId ||
    !DIGEST.test(value.requestFingerprint) ||
    !command ||
    typeof idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY.test(idempotencyKey)
  ) {
    throw new DurableWorkflowClientError(
      'WORKFLOW_PREPARATION_INVALID',
      'WORKFLOW_PREPARATION_INVALID',
    );
  }
  return {
    runId: identity.runId,
    streamId: value.streamId,
    requestFingerprint: value.requestFingerprint as `sha256:${string}`,
    command,
    idempotencyKey,
  };
}

function state(events: readonly DurableWorkflowEvent[]): DurableWorkflowState {
  const kinds = new Set(events.map(({ kind }) => kind));
  if (kinds.has('workflow.completed')) return 'completed';
  if (kinds.has('workflow.cancelled')) return 'cancelled';
  if (kinds.has('workflow.failed')) return 'failed';
  if (kinds.has('workflow.execution.started')) return 'running';
  return 'accepted';
}

function observation(
  runId: string,
  afterCursor: bigint,
  events: readonly DurableWorkflowEvent[],
): DurableWorkflowObservation {
  if (events.length === 0) {
    throw new DurableWorkflowClientError(
      'WORKFLOW_RUN_NOT_FOUND',
      'WORKFLOW_RUN_NOT_FOUND',
    );
  }
  const latest = events.at(-1)?.sequence ?? 0n;
  const completed = [...events]
    .reverse()
    .find(
      (event) =>
        event.kind === 'workflow.completed' &&
        Object.hasOwn(event.payload, 'result'),
    );
  return Object.freeze({
    runId,
    state: state(events),
    cursor: latest.toString(),
    changed: latest > afterCursor,
    cancellationRequested: events.some(
      ({ kind }) => kind === 'workflow.cancel.requested',
    ),
    ...(completed ? { result: completed.payload.result } : {}),
    ...(completed && Array.isArray(completed.payload.nodes)
      ? { nodes: completed.payload.nodes }
      : {}),
    ...(completed && Array.isArray(completed.payload.artifacts)
      ? { artifacts: completed.payload.artifacts }
      : {}),
  });
}

export function createDurableWorkflowClient(
  dependencies: DurableWorkflowClientDependencies,
) {
  const runWorkflow = async (
    command: unknown,
    ownerAgentId?: string,
  ): Promise<DurableWorkflowRunHandle> => {
    const prepared = preparedRun(dependencies.prepare(command));
    const accepted = {
      ...(ownerAgentId ? { ownerAgentId } : {}),
      runId: prepared.runId,
      requestFingerprint: prepared.requestFingerprint,
      workflowRef: prepared.command.workflowRef,
      sourceDigest: prepared.command.sourceDigest,
      hostId: prepared.command.hostId,
      workspace: prepared.command.workspace,
      runtimeProfile: prepared.command.runtimeProfile,
      ...(prepared.command.display
        ? { display: prepared.command.display }
        : {}),
    };
    const result = await dependencies.store.execute({
      commandId: uuid(`${prepared.runId}:submit`),
      streamId: prepared.streamId,
      idempotencyKey: `workflow-submit:${prepared.idempotencyKey}`,
      kind: 'workflow.accepted',
      payload: accepted,
      events: [
        {
          eventId: uuid(`${prepared.runId}:accepted`),
          kind: 'workflow.accepted',
          payload: accepted,
        },
        {
          eventId: uuid(`${prepared.runId}:delivery`),
          kind: 'delivery.requested',
          payload: { runId: prepared.runId },
        },
      ],
      delivery: {
        queue: 'workflow-execution',
        data: { runId: prepared.runId, command: prepared.command },
        retryLimit: 3,
        retryDelaySeconds: 1,
        retryBackoff: true,
        expireInSeconds: 3600,
        deadLetter: 'workflow-execution-dead',
      },
    });
    return Object.freeze({
      runId: prepared.runId,
      state: 'accepted' as const,
      cursor: result.cursor,
    });
  };

  const readWorkflow = async (
    runId: string,
    afterCursor = '0',
  ): Promise<DurableWorkflowObservation> => {
    const identity = runIdentity(runId);
    const parsedCursor = cursor(afterCursor);
    const [commandEvents, runtimeEvents] = await Promise.all([
      dependencies.store.events(identity.commandStreamId, '0'),
      dependencies.store.events(identity.runtimeStreamId, '0'),
    ]);
    const events = [...commandEvents, ...runtimeEvents].sort((left, right) =>
      left.sequence < right.sequence
        ? -1
        : left.sequence > right.sequence
          ? 1
          : 0,
    );
    return observation(runId, parsedCursor, events);
  };

  const cancelWorkflow = async (
    runId: string,
  ): Promise<DurableWorkflowObservation> => {
    const identity = runIdentity(runId);
    const [commandEvents, runtimeEvents] = await Promise.all([
      dependencies.store.events(identity.commandStreamId, '0'),
      dependencies.store.events(identity.runtimeStreamId, '0'),
    ]);
    const events = [...commandEvents, ...runtimeEvents].sort((left, right) =>
      left.sequence < right.sequence
        ? -1
        : left.sequence > right.sequence
          ? 1
          : 0,
    );
    const current = observation(runId, 0n, events);
    if (
      current.cancellationRequested ||
      current.state === 'completed' ||
      current.state === 'failed' ||
      current.state === 'cancelled'
    ) {
      return current;
    }
    const result = await dependencies.store.execute({
      commandId: uuid(`${runId}:cancel-requested:command`),
      streamId: identity.runtimeStreamId,
      idempotencyKey: `workflow:${runId}:cancel-requested`,
      kind: 'workflow.cancel.requested',
      payload: { runId },
      events: [
        {
          eventId: uuid(`${runId}:cancel-requested:event`),
          kind: 'workflow.cancel.requested',
          payload: { runId },
        },
      ],
    });
    return Object.freeze({
      ...current,
      cursor: result.cursor,
      changed: true,
      cancellationRequested: true,
    });
  };

  return Object.freeze({
    runWorkflow,
    run_workflow: runWorkflow,
    readWorkflow,
    cancelWorkflow,
  });
}
