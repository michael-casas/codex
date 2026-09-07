import { PgBoss, type Db, type JobWithMetadata } from 'pg-boss';

import type {
  AgentMessageDeliveryRecord,
  AgentMessageOutboxWriter,
  AgentMessageTransactionDatabase,
  PostgresAgentMessageStore,
} from '@codex/db';

const QUEUE = 'agent-message';
const DEAD_LETTER = 'agent-message-dead-letter';

export class AgentMessageDeliveryRuntime implements AgentMessageOutboxWriter {
  private readonly boss: PgBoss;
  private started = false;

  constructor(
    runtimeConnectionString: string,
    private readonly adminConnectionString = runtimeConnectionString,
  ) {
    this.boss = new PgBoss({
      connectionString: runtimeConnectionString,
      createSchema: false,
      migrate: false,
    });
    this.boss.on('error', () => undefined);
  }

  async start(): Promise<void> {
    if (this.started) return;
    const admin = new PgBoss(this.adminConnectionString);
    admin.on('error', () => undefined);
    try {
      await admin.start();
      await admin.createQueue(QUEUE);
      await admin.createQueue(DEAD_LETTER);
      await admin.getDb().executeSql(`
        GRANT USAGE ON SCHEMA pgboss TO process_daemon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO process_daemon;
        GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO process_daemon;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO process_daemon;
      `);
    } finally {
      await admin.stop({ graceful: true, close: true, timeout: 5_000 });
    }
    await this.boss.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.boss.stop({ graceful: true, close: true, timeout: 5_000 });
  }

  async enqueue(
    database: AgentMessageTransactionDatabase & Db,
    messageId: string,
  ): Promise<string> {
    if (!this.started) throw new Error('MESSAGE_DELIVERY_NOT_STARTED');
    const jobId = await this.boss.send(
      QUEUE,
      { messageId },
      {
        id: messageId,
        retryLimit: 4,
        retryDelay: 2,
        retryBackoff: true,
        expireInSeconds: 60,
        deadLetter: DEAD_LETTER,
        db: database,
      },
    );
    if (!jobId) throw new Error('MESSAGE_DELIVERY_JOB_REJECTED');
    await database.executeSql(
      'SELECT process.attach_agent_message_job($1::uuid,$2::uuid)',
      [messageId, jobId],
    );
    return jobId;
  }

  async work(handler: (messageId: string) => Promise<void>): Promise<string> {
    if (!this.started) throw new Error('MESSAGE_DELIVERY_NOT_STARTED');
    return this.boss.work<{ messageId: string }>(QUEUE, async (jobs) => {
      for (const job of jobs) await handler(job.data.messageId);
    });
  }

  find(messageId: string): Promise<readonly JobWithMetadata<object>[]> {
    return this.boss.findJobs(QUEUE, { id: messageId });
  }
}

export interface AgentMessageAppServerConnection {
  request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  reconnect(): Promise<void>;
}

export interface AgentMessageAppServerRegistry {
  connect(hostId: string): Promise<AgentMessageAppServerConnection>;
}

interface SnapshotItem {
  type?: string;
  clientId?: string | null;
  content?: Array<{ type?: string; text?: string }>;
}

interface SnapshotTurn {
  id?: string;
  status?: string;
  items?: SnapshotItem[];
}

interface ThreadSnapshot {
  thread?: {
    status?: { type?: string };
    turns?: SnapshotTurn[];
  };
}

function observed(
  snapshot: ThreadSnapshot,
  message: AgentMessageDeliveryRecord,
) {
  return snapshot.thread?.turns?.some((turn) =>
    turn.items?.some(
      (item) =>
        item.clientId === message.messageId ||
        item.content?.some(
          (content) =>
            content.type === 'text' && content.text?.includes(message.marker),
        ),
    ),
  );
}

function activeTurn(snapshot: ThreadSnapshot): string | undefined {
  if (snapshot.thread?.status?.type !== 'active') return undefined;
  const turns = snapshot.thread.turns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index]?.status === 'inProgress') return turns[index]?.id;
  }
  return undefined;
}

function input(message: AgentMessageDeliveryRecord) {
  return [
    {
      type: 'text',
      text: `[${message.marker}] ${message.kind} from ${message.fromAgentId}\n${message.body}`,
    },
  ];
}

export function createAgentMessageDeliveryWorker(
  repository: Pick<PostgresAgentMessageStore, 'delivery' | 'mark'>,
  hosts: AgentMessageAppServerRegistry,
) {
  const methodMissing = (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'providerCode' in error &&
    error.providerCode === -32_601;

  const readThread = async (
    connection: AgentMessageAppServerConnection,
    threadId: string,
  ): Promise<ThreadSnapshot> => {
    try {
      return await connection.request<ThreadSnapshot>('thread/read', {
        threadId,
        includeTurns: true,
      });
    } catch (error) {
      if (!methodMissing(error)) throw error;
      try {
        const [items, threads] = await Promise.all([
          connection.request<{
            data: Array<{
              turnId: string;
              item: SnapshotItem;
            }>;
          }>('thread/items/list', {
            threadId,
            limit: 100,
            sortDirection: 'desc',
          }),
          connection.request<{
            data: Array<{ id: string; status?: { type?: string } }>;
          }>('thread/list', {}),
        ]);
        const status =
          threads.data.find(({ id }) => id === threadId)?.status ??
          ({ type: 'notLoaded' } as const);
        const grouped = new Map<string, SnapshotTurn>();
        for (const entry of items.data) {
          const turn = grouped.get(entry.turnId) ?? {
            id: entry.turnId,
            status: 'completed',
            items: [],
          };
          turn.items?.push(entry.item);
          grouped.set(entry.turnId, turn);
        }
        const turns = [...grouped.values()];
        if (status.type === 'active' && turns[0])
          turns[0].status = 'inProgress';
        return { thread: { status, turns } };
      } catch (itemsError) {
        if (!methodMissing(itemsError)) throw itemsError;
      }
      let turns: NonNullable<ThreadSnapshot['thread']>['turns'];
      try {
        const result = await connection.request<{
          data: NonNullable<ThreadSnapshot['thread']>['turns'];
        }>('thread/turns/list', {
          threadId,
          limit: 100,
          sortDirection: 'desc',
          itemsView: 'full',
        });
        turns = result.data ?? [];
      } catch (turnsError) {
        if (!methodMissing(turnsError)) throw turnsError;
        try {
          const result = await connection.request<ThreadSnapshot>(
            'thread/resume',
            { threadId, excludeTurns: false },
          );
          turns = result.thread?.turns ?? [];
        } catch (resumeError) {
          if (!methodMissing(resumeError)) throw resumeError;
          const result = await connection.request<{
            data: Array<{ id: string; status?: { type?: string } }>;
          }>('thread/list', {});
          const thread = result.data.find(({ id }) => id === threadId);
          return {
            thread: {
              status: thread?.status ?? { type: 'notLoaded' },
              turns: [],
            },
          };
        }
      }
      return {
        thread: {
          status: {
            type: turns.some(({ status }) => status === 'inProgress')
              ? 'active'
              : 'idle',
          },
          turns,
        },
      };
    }
  };

  const reconcile = async (
    connection: AgentMessageAppServerConnection,
    message: AgentMessageDeliveryRecord,
  ) => {
    const snapshot = await readThread(connection, message.threadId);
    if (!observed(snapshot, message)) return snapshot;
    await repository.mark(message.messageId, 'thread-observed');
    return undefined;
  };

  return async (messageId: string): Promise<void> => {
    const message = await repository.delivery(messageId);
    if (message.state === 'thread-observed' || message.state === 'replied')
      return;
    if (message.expiresAt && Date.parse(message.expiresAt) <= Date.now()) {
      await repository.mark(messageId, 'expired');
      return;
    }
    const connection = await hosts.connect(message.hostId);
    const snapshot = await reconcile(connection, message);
    if (!snapshot) return;
    const turnId = activeTurn(snapshot);
    try {
      const result = turnId
        ? await connection.request<{ turnId: string }>('turn/steer', {
            threadId: message.threadId,
            clientUserMessageId: message.messageId,
            input: input(message),
            expectedTurnId: turnId,
          })
        : await connection.request<{ turn: { id: string } }>('turn/start', {
            threadId: message.threadId,
            clientUserMessageId: message.messageId,
            input: input(message),
          });
      const acceptedTurnId =
        'turnId' in result ? result.turnId : result.turn.id;
      await repository.mark(messageId, 'app-server-accepted', acceptedTurnId);
      if (await reconcile(connection, message)) {
        throw new Error('MESSAGE_OBSERVATION_PENDING');
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'ambiguous' in error &&
        error.ambiguous === true
      ) {
        await connection.reconnect();
        if (!(await reconcile(connection, message))) return;
        await repository.mark(messageId, 'failed');
        return;
      }
      throw error;
    }
  };
}
