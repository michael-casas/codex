import {
  mapAppServerVisibility,
  type AppServerInboundMessage,
} from '@codex/codex';
import type {
  DelegationRecord,
  DelegationRepository,
  DelegationServiceDependencies,
} from '@codex/process';

export interface DelegationActivity {
  readonly kind: string;
  readonly itemId?: string;
  readonly item?: unknown;
  readonly detail?: {
    readonly type: 'message' | 'command' | 'tool';
    readonly body: string;
  };
}

export interface DelegationObservationOptions {
  readonly onState?: (record: DelegationRecord) => Promise<void>;
  readonly onActivity?: (
    record: DelegationRecord,
    activity: DelegationActivity,
  ) => Promise<void>;
}

type Connection = Awaited<
  ReturnType<DelegationServiceDependencies['hosts']['connect']>
>;
type ObservedConnection = Connection & {
  messages(options: {
    signal: AbortSignal;
  }): AsyncIterable<AppServerInboundMessage>;
  close(): Promise<void>;
};
interface Observation {
  threadId: string;
  turnId?: string;
  method: string;
  status?: string;
  activity?: DelegationActivity;
}
interface Feed {
  connection: ObservedConnection;
  hostId: string;
  controller: AbortController;
  threadId?: string;
  turnId?: string;
  bindingPending: boolean;
  early: Observation[];
  serial: Promise<void>;
  task: Promise<void>;
  closing: boolean;
  failure?: Error;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function observation(
  message: AppServerInboundMessage,
): Observation | undefined {
  const params = object(message.params);
  if (typeof params.threadId !== 'string') return undefined;
  const turn = object(params.turn);
  const mapped = mapAppServerVisibility(message);
  const detail = object(mapped?.detail);
  const activity =
    mapped && typeof mapped.kind === 'string'
      ? {
          kind: mapped.kind,
          ...(mapped.item ? { item: mapped.item } : {}),
          ...(typeof mapped.itemId === 'string'
            ? { itemId: mapped.itemId }
            : {}),
          ...(['message', 'command', 'tool'].includes(String(detail.type)) &&
          typeof detail.body === 'string'
            ? {
                detail: {
                  type: detail.type as 'message' | 'command' | 'tool',
                  body: detail.body,
                },
              }
            : {}),
        }
      : undefined;
  if (
    !activity &&
    !['turn/completed', 'turn/started', 'item/tool/requestUserInput'].includes(
      message.method,
    ) &&
    !message.method.includes('requestApproval')
  )
    return undefined;
  return {
    threadId: params.threadId,
    ...(typeof params.turnId === 'string'
      ? { turnId: params.turnId }
      : typeof turn.id === 'string'
        ? { turnId: turn.id }
        : {}),
    method: message.method,
    ...(typeof turn.status === 'string' ? { status: turn.status } : {}),
    ...(activity ? { activity } : {}),
  };
}

async function bounded(operation: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error('DELEGATION_OBSERVATION_CLOSE_TIMEOUT')),
          5_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createDelegationObservation(
  repository: DelegationRepository,
  hosts: DelegationServiceDependencies['hosts'],
  options: DelegationObservationOptions,
  observeAgent: (
    id: string,
    event: { type: string },
  ) => Promise<DelegationRecord>,
) {
  const feeds = new Map<Connection, Feed>();
  const bindings = new Map<string, DelegationRecord>();
  const owners = new Map<string, Feed>();
  let started = false;
  const key = (hostId: string, threadId: string) => `${hostId}\0${threadId}`;
  const enqueue = (feed: Feed, operation: () => Promise<void>) => {
    const pending = feed.serial.then(operation);
    feed.serial = pending.catch(() => undefined);
    return pending;
  };

  async function dispatch(feed: Feed, event: Observation) {
    const identity = key(feed.hostId, event.threadId);
    if (owners.get(identity) !== feed) return;
    const record = bindings.get(identity);
    if (!record || feed.bindingPending) {
      if (feed.early.length >= 100)
        throw Error('DELEGATION_OBSERVATION_BACKPRESSURE');
      feed.early.push(event);
      return;
    }
    if (event.turnId && event.turnId !== record.activeTurnId) return;
    if (feed.turnId && feed.turnId !== record.activeTurnId) return;
    if (event.activity) await options.onActivity?.(record, event.activity);
    if (!['running', 'blocked', 'ambiguous'].includes(record.state)) return;
    if (event.method === 'turn/completed') {
      if (event.status === 'completed')
        await observeAgent(record.delegationId, { type: 'turn/completed' });
      else
        await observedRepository.transition(
          record.delegationId,
          event.status === 'failed'
            ? 'failed'
            : event.status === 'interrupted'
              ? 'cancelled'
              : 'ambiguous',
        );
    } else if (
      event.method.includes('requestApproval') ||
      event.method === 'item/tool/requestUserInput'
    ) {
      await observeAgent(record.delegationId, { type: event.method });
    }
  }

  async function publish(
    record: DelegationRecord,
    flush = false,
  ): Promise<DelegationRecord> {
    if (record.threadId)
      bindings.set(key(record.command.hostId, record.threadId), record);
    await options.onState?.(record);
    const feed = record.threadId
      ? owners.get(key(record.command.hostId, record.threadId))
      : undefined;
    if (flush && feed?.failure)
      return observedRepository.transition(record.delegationId, 'ambiguous');
    if (flush && feed)
      await enqueue(feed, async () => {
        feed.bindingPending = false;
        for (const event of feed.early.splice(0)) await dispatch(feed, event);
      });
    return record;
  }

  const observedRepository: DelegationRepository = {
    async reserve(command, fingerprint, ownerAgentId) {
      const reserved = await repository.reserve(command, fingerprint, ownerAgentId);
      await publish(reserved.record);
      return reserved;
    },
    async bind(id, binding) {
      return publish(await repository.bind(id, binding), true);
    },
    async read(id) {
      const record = await repository.read(id);
      if (record?.threadId)
        bindings.set(key(record.command.hostId, record.threadId), record);
      return record;
    },
    async transition(id, state, turnId) {
      return publish(
        await repository.transition(id, state, turnId),
        turnId !== undefined,
      );
    },
  };

  async function pump(feed: Feed): Promise<void> {
    try {
      for await (const message of feed.connection.messages({
        signal: feed.controller.signal,
      })) {
        const event = observation(message);
        if (event) await enqueue(feed, () => dispatch(feed, event));
      }
      if (!feed.closing) throw Error('DELEGATION_OBSERVATION_CLOSED');
    } catch {
      if (feed.closing) return;
      feed.failure = Error('DELEGATION_OBSERVATION_FAILED');
      const identity = feed.threadId && key(feed.hostId, feed.threadId);
      const record = identity ? bindings.get(identity) : undefined;
      if (
        identity &&
        owners.get(identity) === feed &&
        record &&
        ['running', 'blocked'].includes(record.state)
      ) {
        await observedRepository
          .transition(record.delegationId, 'ambiguous')
          .catch(() => {
            feed.failure = Error('DELEGATION_OBSERVATION_STATE_FAILED');
          });
      }
    }
  }

  async function close(feed: Feed) {
    feed.closing = true;
    feed.controller.abort();
    await bounded(
      Promise.all([feed.connection.close(), feed.task, feed.serial]),
    );
    feed.early.length = 0;
  }

  return {
    repository: observedRepository,
    hosts: {
      async connect(hostId: string): Promise<Connection> {
        if (!started) throw Error('DELEGATION_OBSERVATION_NOT_STARTED');
        const connection = await hosts.connect(hostId);
        if (
          !('messages' in connection) ||
          typeof connection.messages !== 'function' ||
          !('close' in connection) ||
          typeof connection.close !== 'function'
        ) {
          throw Error('DELEGATION_OBSERVATION_UNAVAILABLE');
        }
        if (!started) {
          await bounded((connection as ObservedConnection).close());
          throw Error('DELEGATION_OBSERVATION_NOT_STARTED');
        }
        let feed = feeds.get(connection);
        if (!feed) {
          feed = {
            connection: connection as ObservedConnection,
            hostId,
            controller: new AbortController(),
            bindingPending: true,
            early: [],
            serial: Promise.resolve(),
            task: Promise.resolve(),
            closing: false,
          };
          feeds.set(connection, feed);
          feed.task = pump(feed);
        }
        const current = feed;
        return {
          async request<T>(
            method: string,
            params?: Record<string, unknown>,
          ): Promise<T> {
            if (!started || current.closing)
              throw Error('DELEGATION_OBSERVATION_NOT_STARTED');
            if (current.failure) throw current.failure;
            if (
              ['turn/start', 'turn/steer', 'turn/interrupt'].includes(method) &&
              typeof params?.threadId === 'string'
            ) {
              const identity = key(hostId, params.threadId);
              const previous = owners.get(identity);
              owners.set(identity, current);
              current.threadId = params.threadId;
              current.bindingPending = method !== 'turn/interrupt';
              if (previous && previous !== current) await close(previous);
            }
            const response = await connection.request<T>(method, params);
            if (method === 'turn/start' || method === 'turn/steer') {
              const result = object(response);
              const turnId =
                method === 'turn/start'
                  ? object(result.turn).id
                  : result.turnId;
              if (typeof turnId === 'string') current.turnId = turnId;
            }
            if (current.failure) throw current.failure;
            return response;
          },
        };
      },
    },
    async start() {
      started = true;
    },
    async stop() {
      started = false;
      const failures: Error[] = [];
      for (const feed of [...feeds.values()].reverse()) {
        try {
          await close(feed);
        } catch {
          failures.push(Error('DELEGATION_OBSERVATION_CLOSE_FAILED'));
        }
        if (feed.failure) failures.push(feed.failure);
      }
      feeds.clear();
      bindings.clear();
      owners.clear();
      if (failures.length)
        throw new AggregateError(
          failures,
          'Delegation observation shutdown failed',
        );
    },
  };
}
