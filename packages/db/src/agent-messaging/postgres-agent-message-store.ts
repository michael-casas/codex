import { Client } from 'pg';

import type {
  AgentDirectoryRepository,
  AgentMessageHandle,
  AgentIncomingMessage,
  AgentMessageRepository,
  AgentMessageState,
  AgentMessageSubmission,
  AgentRuntimeRegistration,
} from '@codex/process';

export interface AgentMessageTransactionDatabase {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface AgentMessageOutboxWriter {
  enqueue(
    database: AgentMessageTransactionDatabase,
    messageId: string,
  ): Promise<string>;
}

export interface AgentMessageDeliveryRecord extends AgentMessageHandle {
  readonly kind: AgentMessageSubmission['kind'];
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly body: string;
  readonly marker: string;
  readonly expiresAt?: string;
  readonly hostId: string;
  readonly threadId: string;
  readonly providerTurnId?: string;
}

export class PostgresAgentMessageStore
  implements AgentDirectoryRepository, AgentMessageRepository
{
  constructor(
    readonly connectionString: string,
    private readonly outbox?: AgentMessageOutboxWriter,
  ) {}

  async register(
    input: AgentRuntimeRegistration,
  ): Promise<AgentRuntimeRegistration> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        agent_id: string;
        host_id: string;
        thread_id: string;
        session_id: string | null;
      }>('SELECT * FROM process.register_agent_runtime($1,$2,$3,$4)', [
        input.agentId,
        input.hostId,
        input.threadId,
        input.sessionId ?? null,
      ]);
      const row = result.rows[0];
      if (!row) throw new Error('AGENT_RUNTIME_RESULT_INVALID');
      return {
        agentId: row.agent_id,
        hostId: row.host_id,
        threadId: row.thread_id,
        ...(row.session_id ? { sessionId: row.session_id } : {}),
      };
    } finally {
      await client.end();
    }
  }

  async read(agentId: string): Promise<AgentRuntimeRegistration | undefined> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        agent_id: string;
        host_id: string;
        thread_id: string;
        session_id: string | null;
      }>(
        'SELECT agent_id, host_id, thread_id, session_id FROM process.list_agent_runtimes() WHERE agent_id = $1',
        [agentId],
      );
      const row = result.rows[0];
      return row
        ? {
            agentId: row.agent_id,
            hostId: row.host_id,
            threadId: row.thread_id,
            ...(row.session_id ? { sessionId: row.session_id } : {}),
          }
        : undefined;
    } finally {
      await client.end();
    }
  }

  async list(): Promise<readonly AgentRuntimeRegistration[]> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        agent_id: string;
        host_id: string;
        thread_id: string;
        session_id: string | null;
      }>(
        'SELECT agent_id, host_id, thread_id, session_id FROM process.list_agent_runtimes()',
      );
      return result.rows.map((row) => ({
        agentId: row.agent_id,
        hostId: row.host_id,
        threadId: row.thread_id,
        ...(row.session_id ? { sessionId: row.session_id } : {}),
      }));
    } finally {
      await client.end();
    }
  }

  async registerOwned(
    input: {
      agentId: string;
      hostId: string;
      threadId: string;
      sessionId?: string;
    },
    ownerAgentId: string,
  ): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query(
        'SELECT process.register_owned_agent_runtime($1,$2,$3,$4,$5)',
        [
          input.agentId,
          input.hostId,
          input.threadId,
          input.sessionId ?? null,
          ownerAgentId,
        ],
      );
    } finally {
      await client.end();
    }
  }

  async ownsRecipient(
    actorAgentId: string,
    recipientAgentId: string,
  ): Promise<boolean> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      return (
        (
          await client.query(
            'SELECT process.coordinator_owns_recipient($1,$2) AS allowed',
            [actorAgentId, recipientAgentId],
          )
        ).rows[0]?.allowed === true
      );
    } finally {
      await client.end();
    }
  }

  submitCoordinator(
    input: AgentMessageSubmission,
    actorAgentId: string,
  ): Promise<AgentMessageHandle> {
    return this.submit(input, actorAgentId);
  }

  async submit(
    input: AgentMessageSubmission,
    coordinatorActor?: string,
  ): Promise<AgentMessageHandle> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query('BEGIN');
      if (
        coordinatorActor !== undefined &&
        (input.fromAgentId !== coordinatorActor ||
          (
            await client.query(
              'SELECT process.coordinator_owns_recipient($1,$2) AS allowed',
              [coordinatorActor, input.toAgentId],
            )
          ).rows[0]?.allowed !== true)
      )
        throw new Error('MESSAGE_UNAUTHORIZED');
      const result = await client.query<{
        message_id: string;
        correlation_id: string;
        state: AgentMessageState;
        replayed: boolean;
      }>(
        'SELECT * FROM process.submit_agent_message($1,$2,$3,$4,$5,$6::uuid,$7::timestamptz)',
        [
          input.idempotencyKey,
          input.kind,
          input.fromAgentId,
          input.toAgentId,
          input.body,
          input.correlationId ?? null,
          input.expiresAt ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('MESSAGE_RESULT_INVALID');
      if (!row.replayed) {
        if (!this.outbox) throw new Error('MESSAGE_OUTBOX_WRITER_MISSING');
        await this.outbox.enqueue(
          { executeSql: async (text, values) => client.query(text, values) },
          row.message_id,
        );
      }
      await client.query('COMMIT');
      return {
        messageId: row.message_id,
        correlationId: row.correlation_id,
        state: row.state,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  async pending(agentId: string): Promise<readonly AgentIncomingMessage[]> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        message_id: string;
        correlation_id: string;
        kind: AgentMessageSubmission['kind'];
        from_agent_id: string;
        to_agent_id: string;
        body: string;
        state: AgentMessageState;
      }>('SELECT * FROM process.read_pending_agent_messages($1)', [agentId]);
      return result.rows.map((row) => ({
        messageId: row.message_id,
        correlationId: row.correlation_id,
        kind: row.kind,
        fromAgentId: row.from_agent_id,
        toAgentId: row.to_agent_id,
        body: row.body,
        state: row.state,
      }));
    } finally {
      await client.end();
    }
  }

  async delivery(messageId: string): Promise<AgentMessageDeliveryRecord> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{
        message_id: string;
        correlation_id: string;
        kind: AgentMessageSubmission['kind'];
        from_agent_id: string;
        to_agent_id: string;
        body: string;
        state: AgentMessageState;
        marker: string;
        expires_at: Date | null;
        host_id: string;
        thread_id: string;
        provider_turn_id: string | null;
      }>('SELECT * FROM process.read_agent_message($1::uuid)', [messageId]);
      const row = result.rows[0];
      if (!row) throw new Error('MESSAGE_NOT_FOUND');
      return {
        messageId: row.message_id,
        correlationId: row.correlation_id,
        kind: row.kind,
        fromAgentId: row.from_agent_id,
        toAgentId: row.to_agent_id,
        body: row.body,
        state: row.state,
        marker: row.marker,
        ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
        hostId: row.host_id,
        threadId: row.thread_id,
        ...(row.provider_turn_id
          ? { providerTurnId: row.provider_turn_id }
          : {}),
      };
    } finally {
      await client.end();
    }
  }

  async mark(
    messageId: string,
    state: AgentMessageState,
    providerTurnId?: string,
  ): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query('SELECT process.mark_agent_message($1::uuid,$2,$3)', [
        messageId,
        state,
        providerTurnId ?? null,
      ]);
    } finally {
      await client.end();
    }
  }
}
