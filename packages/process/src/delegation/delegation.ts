import { createHash } from 'node:crypto';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const COMMAND_KEYS = new Set(['idempotencyKey', 'assignmentRef', 'assignmentDigest', 'hostId', 'workspace', 'runtimeProfile', 'existingThread', 'completionBoundary', 'prompt']);

export type CompletionBoundary = 'runtime-settled' | 'output-validated' | 'ready-for-audit';
export type DelegationState = 'reserved' | 'running' | 'blocked' | CompletionBoundary | 'ambiguous' | 'failed' | 'cancelled';

interface DelegateAgentCommandBase {
  readonly idempotencyKey: string;
  readonly assignmentRef: string;
  readonly assignmentDigest: `sha256:${string}`;
  readonly hostId: string;
  readonly workspace: { readonly repositoryId: string; readonly baseRevision: string; readonly assignmentId: string };
  readonly completionBoundary: CompletionBoundary;
  readonly prompt: string;
}

export interface ExistingThreadTarget {
  readonly threadId: string;
  readonly activeTurn:
    | { readonly behavior: 'reject' }
    | { readonly behavior: 'steer'; readonly expectedTurnId: string };
}

export interface ManagedDelegateAgentCommand extends DelegateAgentCommandBase {
  readonly runtimeProfile: { readonly model: string; readonly reasoningEffort: string; readonly sandbox: string; readonly approvalPolicy: string; readonly networkAccess?: boolean };
  readonly existingThread?: never;
}

export interface AdoptedDelegateAgentCommand extends DelegateAgentCommandBase {
  readonly existingThread: ExistingThreadTarget;
  readonly runtimeProfile?: never;
}

export type DelegateAgentCommand = ManagedDelegateAgentCommand | AdoptedDelegateAgentCommand;

export interface AgentHandle { readonly delegationId: string; readonly executionId: string; readonly agentId: string; readonly hostId: string; readonly threadId: string; readonly ownership: 'managed' | 'adopted' }

export interface DelegationRecord {
  readonly delegationId: string; readonly executionId: string; readonly agentId: string; readonly fingerprint: string;
  readonly command: DelegateAgentCommand; readonly state: DelegationState; readonly workspaceRef?: string; readonly threadId?: string;
  readonly sessionId?: string; readonly activeTurnId?: string; readonly ownership?: 'managed' | 'adopted';
}

export interface DelegationRepository {
  reserve(command: DelegateAgentCommand, fingerprint: string): Promise<{ record: DelegationRecord; replayed: boolean }>;
  bind(delegationId: string, binding: { hostId: string; workspaceRef?: string; threadId: string; sessionId: string; activeTurnId?: string; ownership?: 'managed' | 'adopted' }): Promise<DelegationRecord>;
  read(delegationId: string): Promise<DelegationRecord | undefined>;
  transition(delegationId: string, state: DelegationState, activeTurnId?: string): Promise<DelegationRecord>;
}

interface Connection { request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> }
export interface DelegationServiceDependencies {
  repository: DelegationRepository;
  hosts: { connect(hostId: string): Promise<Connection> };
  workspaces: {
    acquire(input: DelegateAgentCommand['workspace'] & { hostId: string }): Promise<{ workspaceRef: string }>;
    resolve(workspaceRef: string): Promise<{ cwd: string }>;
    authorizeExisting?(input: DelegateAgentCommand['workspace'] & { hostId: string }, cwd: string): Promise<{ cwd: string }>;
    release(workspaceRef: string): Promise<void>;
  };
}

export class DelegationError extends Error {
  constructor(readonly code: string, message: string, readonly ambiguous = false) { super(message); this.name = 'DelegationError'; }
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }

function validate(value: unknown): DelegateAgentCommand {
  if (!object(value) || Object.keys(value).some((key) => !COMMAND_KEYS.has(key)) || !object(value.workspace)) throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
  const c = value as unknown as DelegateAgentCommand;
  if (!ID.test(c.idempotencyKey) || !ID.test(c.assignmentRef) || !DIGEST.test(c.assignmentDigest) || !ID.test(c.hostId) ||
      !exact(value.workspace, ['repositoryId', 'baseRevision', 'assignmentId']) || !ID.test(c.workspace.repositoryId) || !REVISION.test(c.workspace.baseRevision) || !ID.test(c.workspace.assignmentId) ||
      !['runtime-settled', 'output-validated', 'ready-for-audit'].includes(c.completionBoundary) || typeof c.prompt !== 'string' || c.prompt.trim().length === 0 || Buffer.byteLength(c.prompt, 'utf8') > 65_536) {
    throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
  }
  if ('existingThread' in value) {
    if ('runtimeProfile' in value || !object(value.existingThread) || !exact(value.existingThread, ['threadId', 'activeTurn']) || !ID.test(String(value.existingThread.threadId)) || !object(value.existingThread.activeTurn)) throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
    const policy = value.existingThread.activeTurn;
    if ((policy.behavior === 'reject' && !exact(policy, ['behavior'])) || (policy.behavior === 'steer' && (!exact(policy, ['behavior', 'expectedTurnId']) || !ID.test(String(policy.expectedTurnId)))) || !['reject', 'steer'].includes(String(policy.behavior))) throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
    return c as AdoptedDelegateAgentCommand;
  }
  if (!object(value.runtimeProfile)) throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
  const managed = c as ManagedDelegateAgentCommand;
  if (!exact(value.runtimeProfile, ['model', 'reasoningEffort', 'sandbox', 'approvalPolicy', ...('networkAccess' in value.runtimeProfile ? ['networkAccess'] : [])]) || typeof managed.runtimeProfile.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$/.test(managed.runtimeProfile.model) || typeof managed.runtimeProfile.reasoningEffort !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(managed.runtimeProfile.reasoningEffort) || !ID.test(managed.runtimeProfile.sandbox) || !ID.test(managed.runtimeProfile.approvalPolicy) || (managed.runtimeProfile.networkAccess !== undefined && typeof managed.runtimeProfile.networkAccess !== 'boolean')) throw new DelegationError('DELEGATION_COMMAND_INVALID', 'Invalid delegation command.');
  return { ...managed, runtimeProfile: { ...managed.runtimeProfile, networkAccess: managed.runtimeProfile.networkAccess ?? true } };
}

function fingerprint(command: DelegateAgentCommand) { return `sha256:${createHash('sha256').update(JSON.stringify(command)).digest('hex')}`; }
function handle(record: DelegationRecord): AgentHandle {
  if (!record.threadId) throw new DelegationError('DELEGATION_NOT_BOUND', 'Delegation has no runtime binding.');
  return { delegationId: record.delegationId, executionId: record.executionId, agentId: record.agentId, hostId: record.command.hostId, threadId: record.threadId, ownership: record.ownership ?? (record.command.existingThread ? 'adopted' : 'managed') };
}
function providerAmbiguous(error: unknown) { return object(error) && (error.ambiguous === true || error.code === 'APP_SERVER_CLOSED' || error.code === 'HOST_RECONNECT_EXHAUSTED'); }
function threadReadFallback(error: unknown) { return object(error) && (error.providerCode === -32_601 || error.providerCode === -32_603); }
function providerApproval(value: string) { return value === 'onRequest' ? 'on-request' : value; }
function providerSandbox(value: string) { return value === 'readOnly' ? 'read-only' : value === 'workspaceWrite' ? 'workspace-write' : value === 'dangerFullAccess' ? 'danger-full-access' : value; }
function providerSandboxPolicy(command: ManagedDelegateAgentCommand, cwd: string) { const { networkAccess = true } = command.runtimeProfile; const sandbox = ({ 'read-only': 'readOnly', 'workspace-write': 'workspaceWrite', 'danger-full-access': 'dangerFullAccess' } as Record<string, string>)[command.runtimeProfile.sandbox] ?? command.runtimeProfile.sandbox; return sandbox === 'workspaceWrite' ? { type: 'workspaceWrite', writableRoots: [cwd], networkAccess, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : sandbox === 'readOnly' ? { type: 'readOnly', networkAccess } : { type: sandbox }; }

async function readThread(connection: Connection, threadId: string, activeTurnId?: string) {
  try { return await connection.request<{ thread?: { id?: string; sessionId?: string; cwd?: string; status?: { type?: string }; turns?: Array<{ id?: string; status?: string }> } }>('thread/read', { threadId, includeTurns: true }); }
  catch (error) {
    if (!threadReadFallback(error)) throw error;
    const listed = await connection.request<{ data: Array<{ id: string; status?: { type?: string } }> }>('thread/list', {});
    const status = listed.data.find(({ id }) => id === threadId)?.status ?? { type: 'notLoaded' };
    return { thread: { status, turns: status.type === 'active' && activeTurnId ? [{ id: activeTurnId, status: 'inProgress' }] : [] } };
  }
}

export function reduceDelegationEvent(current: DelegationState, event: { type: string }, boundary: CompletionBoundary): DelegationState {
  if (event.type.includes('requestApproval') || event.type === 'item/tool/requestUserInput') return 'blocked';
  if (event.type === 'transport/closed') return 'ambiguous';
  if (event.type === 'turn/completed') return 'runtime-settled';
  if (event.type === 'output/validated' && current === 'runtime-settled') return boundary === 'runtime-settled' ? current : 'output-validated';
  if (event.type === 'audit/ready' && current === 'output-validated' && boundary === 'ready-for-audit') return 'ready-for-audit';
  return current;
}

export function createDelegationService(deps: DelegationServiceDependencies) {
  const inFlight = new Map<string, Promise<AgentHandle>>();
  const delegateAgent = async (raw: DelegateAgentCommand): Promise<AgentHandle> => {
    const command = validate(raw), digest = fingerprint(command);
    const active = inFlight.get(command.idempotencyKey); if (active) return active;
    const operation = (async () => {
      const reserved = await deps.repository.reserve(command, digest);
      if (reserved.replayed && reserved.record.threadId) return handle(reserved.record);
      if (command.existingThread) {
        const target = command.existingThread;
        const connection = await deps.hosts.connect(command.hostId);
        const snapshot = await readThread(connection, target.threadId);
        const thread = snapshot.thread;
        if (!thread || (thread.id !== undefined && thread.id !== target.threadId) || typeof thread.cwd !== 'string') throw new DelegationError('DELEGATION_THREAD_UNAVAILABLE', 'Existing thread is unavailable on the selected host.');
        if (!deps.workspaces.authorizeExisting) throw new DelegationError('DELEGATION_ADOPTION_NOT_CONFIGURED', 'Existing-thread repository authorization is not configured.');
        await deps.workspaces.authorizeExisting({ ...command.workspace, hostId: command.hostId }, thread.cwd);
        const activeTurnId = thread.status?.type === 'active' ? [...(thread.turns ?? [])].reverse().find((turn) => turn.status === 'inProgress')?.id : undefined;
        if (activeTurnId && (target.activeTurn.behavior === 'reject' || target.activeTurn.expectedTurnId !== activeTurnId)) throw new DelegationError('DELEGATION_ACTIVE_TURN_CONFLICT', 'Existing thread has a different active turn.');
        if (!activeTurnId && target.activeTurn.behavior === 'steer') throw new DelegationError('DELEGATION_ACTIVE_TURN_CONFLICT', 'The expected active turn is no longer active.');
        let claimed: DelegationRecord;
        try {
          claimed = await deps.repository.bind(reserved.record.delegationId, {
            hostId: command.hostId,
            threadId: target.threadId,
            sessionId: thread.sessionId ?? target.threadId,
            ...(activeTurnId ? { activeTurnId } : {}),
            ownership: 'adopted',
          });
        } catch {
          throw new DelegationError('DELEGATION_THREAD_CONFLICT', 'Existing host/thread pair is already claimed.');
        }
        try {
          const turnId = activeTurnId
            ? (await connection.request<{ turnId: string }>('turn/steer', { threadId: target.threadId, input: [{ type: 'text', text: command.prompt }], expectedTurnId: activeTurnId })).turnId
            : (await (async () => {
                await connection.request('thread/resume', { threadId: target.threadId });
                return connection.request<{ turn: { id: string } }>('turn/start', { threadId: target.threadId, input: [{ type: 'text', text: command.prompt }] });
              })()).turn.id;
          const running = await deps.repository.transition(claimed.delegationId, 'running', turnId);
          return handle(running);
        } catch (error) {
          const ambiguous = providerAmbiguous(error);
          await deps.repository.transition(claimed.delegationId, ambiguous ? 'ambiguous' : 'failed');
          if (ambiguous) throw error;
          throw new DelegationError('DELEGATION_WRITER_CONFLICT', 'The existing thread changed or is controlled by another writer. Reconnect through its controlling App Server and retry with current turn identity.');
        }
      }
      const lease = await deps.workspaces.acquire({ ...command.workspace, hostId: command.hostId });
      let providerAccepted = false;
      try {
        const [{ cwd }, connection] = await Promise.all([deps.workspaces.resolve(lease.workspaceRef), deps.hosts.connect(command.hostId)]);
        const started = await connection.request<{ thread: { id: string; sessionId?: string } }>('thread/start', {
          model: command.runtimeProfile.model, cwd, approvalPolicy: providerApproval(command.runtimeProfile.approvalPolicy), sandbox: providerSandbox(command.runtimeProfile.sandbox), serviceName: 'codex-control-daemon',
        });
        providerAccepted = true;
        const turn = await connection.request<{ turn: { id: string } }>('turn/start', { threadId: started.thread.id, model: command.runtimeProfile.model, effort: command.runtimeProfile.reasoningEffort, sandboxPolicy: providerSandboxPolicy(command, cwd), input: [{ type: 'text', text: command.prompt }] });
        const bound = await deps.repository.bind(reserved.record.delegationId, { hostId: command.hostId, workspaceRef: lease.workspaceRef, threadId: started.thread.id, sessionId: started.thread.sessionId ?? started.thread.id, activeTurnId: turn.turn.id, ownership: 'managed' });
        return handle(bound);
      } catch (error) {
        if (providerAccepted || providerAmbiguous(error)) await deps.repository.transition(reserved.record.delegationId, 'ambiguous');
        else { await deps.repository.transition(reserved.record.delegationId, 'failed'); await deps.workspaces.release(lease.workspaceRef); }
        throw error;
      }
    })();
    inFlight.set(command.idempotencyKey, operation);
    try { return await operation; } finally { inFlight.delete(command.idempotencyKey); }
  };

  return {
    delegateAgent,
    async continueAgent(commandOrId: string | { delegationId: string; prompt: string; expectedTurnId?: string }, legacyInput?: string) {
      const delegationId = typeof commandOrId === 'string' ? commandOrId : commandOrId.delegationId;
      const input = typeof commandOrId === 'string' ? legacyInput ?? '' : commandOrId.prompt;
      const expectedTurnId = typeof commandOrId === 'string' ? undefined : commandOrId.expectedTurnId;
      if (!ID.test(delegationId) || !input.trim()) throw new DelegationError('DELEGATION_CONTINUE_INVALID', 'Invalid continuation.');
      const record = await deps.repository.read(delegationId); if (!record?.threadId) throw new DelegationError('DELEGATION_NOT_FOUND', 'Delegation not found.');
      if (record.state === 'cancelled') throw new DelegationError('DELEGATION_CANCELLED', 'Delegation is cancelled.');
      const connection = await deps.hosts.connect(record.command.hostId);
      const cwd = record.workspaceRef ? (await deps.workspaces.resolve(record.workspaceRef)).cwd : undefined;
      const snapshot = await readThread(connection, record.threadId, record.activeTurnId);
      const active = snapshot.thread?.status?.type === 'active' ? [...(snapshot.thread.turns ?? [])].reverse().find((turn) => turn.status === 'inProgress')?.id : undefined;
      if (expectedTurnId && active !== expectedTurnId) throw new DelegationError('DELEGATION_ACTIVE_TURN_CONFLICT', 'The expected active turn is no longer active.');
      if (active && 'existingThread' in record.command && !expectedTurnId) throw new DelegationError('DELEGATION_ACTIVE_TURN_CONFLICT', 'Continuing an active adopted thread requires expectedTurnId.');
      const turnId = active ? (await connection.request<{ turnId: string }>('turn/steer', { threadId: record.threadId, input: [{ type: 'text', text: input }], expectedTurnId: active })).turnId : (await (async () => {
        await connection.request('thread/resume', { threadId: record.threadId });
        return 'existingThread' in record.command
          ? connection.request<{ turn: { id: string } }>('turn/start', { threadId: record.threadId, input: [{ type: 'text', text: input }] })
          : connection.request<{ turn: { id: string } }>('turn/start', { threadId: record.threadId, model: record.command.runtimeProfile.model, effort: record.command.runtimeProfile.reasoningEffort, ...(cwd ? { sandboxPolicy: providerSandboxPolicy(record.command, cwd) } : {}), input: [{ type: 'text', text: input }] });
      })()).turn.id;
      await deps.repository.transition(delegationId, 'running', turnId); return handle(record);
    },
    async cancelAgent(delegationId: string) {
      const record = await deps.repository.read(delegationId); if (!record) throw new DelegationError('DELEGATION_NOT_FOUND', 'Delegation not found.');
      if (record.state === 'cancelled') return handle(record);
      if (record.threadId && record.activeTurnId) {
        const connection = await deps.hosts.connect(record.command.hostId);
        const snapshot = await readThread(connection, record.threadId, record.activeTurnId);
        const boundTurnIsActive = snapshot.thread?.status?.type === 'active' && snapshot.thread.turns?.some((turn) => turn.id === record.activeTurnId && turn.status === 'inProgress');
        if (boundTurnIsActive) await connection.request('turn/interrupt', { threadId: record.threadId, turnId: record.activeTurnId });
      }
      if (record.workspaceRef) await deps.workspaces.release(record.workspaceRef);
      const cancelled = await deps.repository.transition(delegationId, 'cancelled'); return handle(cancelled);
    },
    async observeAgent(delegationId: string, event: { type: string }) {
      const record = await deps.repository.read(delegationId); if (!record) throw new DelegationError('DELEGATION_NOT_FOUND', 'Delegation not found.');
      return deps.repository.transition(delegationId, reduceDelegationEvent(record.state, event, record.command.completionBoundary));
    },
    readAgent: (delegationId: string) => deps.repository.read(delegationId),
  };
}
