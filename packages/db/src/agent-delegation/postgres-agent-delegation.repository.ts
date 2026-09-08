import { Client } from 'pg';
import type { DelegateAgentCommand, DelegationRecord, DelegationRepository, DelegationState } from '@codex/process';

type Row = { delegation_id: string; execution_id: string; agent_id: string; request_sha256: string; command: DelegateAgentCommand; state: DelegationState; workspace_ref: string | null; thread_id: string | null; session_id: string | null; active_turn_id: string | null; ownership?: 'managed' | 'adopted'; replayed?: boolean };
const record = (row: Row): DelegationRecord => ({ delegationId: row.delegation_id, executionId: row.execution_id, agentId: row.agent_id, fingerprint: row.request_sha256, command: row.command, state: row.state, ownership: row.ownership ?? (row.command.existingThread ? 'adopted' : 'managed'), ...(row.workspace_ref ? { workspaceRef: row.workspace_ref } : {}), ...(row.thread_id ? { threadId: row.thread_id } : {}), ...(row.session_id ? { sessionId: row.session_id } : {}), ...(row.active_turn_id ? { activeTurnId: row.active_turn_id } : {}) });

export class PostgresAgentDelegationRepository implements DelegationRepository {
  constructor(readonly connectionString: string) {}
  private async query(text: string, values: unknown[]) { const client = new Client({ connectionString: this.connectionString }); await client.connect(); try { return await client.query<Row>(text, values); } finally { await client.end(); } }
  async reserve(command: DelegateAgentCommand, fingerprint: string) { const row = (await this.query('SELECT * FROM process.reserve_agent_delegation($1::jsonb,$2)', [command, fingerprint])).rows[0]; if (!row) throw new Error('DELEGATION_RESERVATION_INVALID'); return { record: record(row), replayed: row.replayed === true }; }
  async bind(delegationId: string, binding: { workspaceRef?: string; threadId: string; sessionId: string; activeTurnId?: string }) { const row = (await this.query('SELECT (process.bind_agent_delegation($1::uuid,$2,$3,$4,$5)).*', [delegationId, binding.workspaceRef ?? null, binding.threadId, binding.sessionId, binding.activeTurnId ?? null])).rows[0]; if (!row) throw new Error('DELEGATION_BIND_INVALID'); return record(row); }
  async read(delegationId: string) { const row = (await this.query('SELECT (process.read_agent_delegation($1::uuid)).*', [delegationId])).rows[0]; return row?.delegation_id ? record(row) : undefined; }
  async transition(delegationId: string, state: DelegationState, activeTurnId?: string) { const row = (await this.query('SELECT (process.transition_agent_delegation($1::uuid,$2,$3)).*', [delegationId, state, activeTurnId ?? null])).rows[0]; if (!row) throw new Error('DELEGATION_TRANSITION_INVALID'); return record(row); }
}
