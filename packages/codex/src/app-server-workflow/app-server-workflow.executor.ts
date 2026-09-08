import { isAbsolute, relative, resolve } from 'node:path';
import type {
  AppServerInboundMessage,
  AppServerJson,
  AppServerRequestId,
} from '../app-server-client/app-server-client.types.js';
import { mapAppServerVisibility } from './app-server-visibility.mapper.js';

export interface AppServerWorkflowNode {
  readonly id: string;
  readonly model?: string;
  readonly reasoning?: string;
  readonly networkAccess?: boolean;
  readonly existingThread?: AppServerExistingThreadTarget;
}

export interface AppServerExistingThreadTarget {
  readonly hostId: string;
  readonly threadId: string;
  readonly activeTurn: { readonly behavior: 'reject' } | { readonly behavior: 'steer'; readonly expectedTurnId: string };
}

export interface AppServerWorkflowRuntimeEvent {
  readonly type:
    | 'thread.started'
    | 'turn.started'
    | 'item.completed'
    | 'turn.completed'
    | 'turn.interrupted'
    | 'runtime.reconnected';
  readonly nodeId: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly itemType?: string;
}

export interface AppServerWorkflowRequest {
  readonly node: AppServerWorkflowNode;
  readonly model?: string;
  readonly reasoning?: string;
  readonly existingThread?: AppServerExistingThreadTarget;
  readonly prompt: string;
  readonly outputSchema?: Exclude<
    AppServerJson,
    null | boolean | number | string | AppServerJson[]
  >;
  readonly signal: AbortSignal;
  readonly onRuntimeEvent: (
    event: AppServerWorkflowRuntimeEvent,
  ) => void | Promise<void>;
}

export interface AppServerWorkflowResult {
  readonly threadId: string;
  readonly finalResponse: string;
  readonly usage: AppServerJson;
}

export interface AppServerWorkflowPrivateEvent {
  readonly type:
    | 'thread.started'
    | 'turn.started'
    | 'item.completed'
    | 'turn.completed';
  readonly threadId?: string;
  readonly item?: {
    readonly id: string;
    readonly type: string;
    readonly text?: string;
    readonly command?: string;
    readonly status?: string;
    readonly exitCode?: number;
  };
}

const attestedEvents = new WeakMap<
  AppServerWorkflowResult,
  readonly AppServerWorkflowPrivateEvent[]
>();

export function isAttestedAppServerWorkflowResult(
  value: unknown,
): value is AppServerWorkflowResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    attestedEvents.has(value as AppServerWorkflowResult)
  );
}

export function readAttestedAppServerWorkflowEvents(
  value: unknown,
): readonly AppServerWorkflowPrivateEvent[] | undefined {
  return isAttestedAppServerWorkflowResult(value)
    ? attestedEvents.get(value)
    : undefined;
}

export interface AppServerWorkflowBinding {
  readonly nodeId: string;
  readonly threadId: string;
  readonly turnId?: string;
}

export interface AppServerWorkflowConnection {
  request<T = AppServerJson>(
    method: string,
    params?: AppServerJson,
  ): Promise<T>;
  messages(options?: {
    signal?: AbortSignal;
  }): AsyncIterable<AppServerInboundMessage>;
  respond(
    id: AppServerRequestId,
    response:
      | { result: AppServerJson }
      | { error: { code: number; message: string } },
  ): Promise<void>;
  reconnect(): Promise<void>;
}

export interface AppServerWorkflowExecutorOptions {
  readonly connection: AppServerWorkflowConnection;
  readonly cwd: string;
  readonly tempDirectory: string;
  readonly sandbox: 'readOnly' | 'workspaceWrite';
  readonly approvalPolicy: 'never';
  readonly onObservation?: (
    event: Record<string, unknown>,
  ) => void | Promise<void>;
  readonly authorizeExisting?: (target: AppServerExistingThreadTarget, cwd: string) => Promise<void>;
}

interface ActiveTurn {
  readonly request: AppServerWorkflowRequest;
  readonly threadId: string;
  turnId?: string;
  finalResponse: string;
  readonly privateEvents: AppServerWorkflowPrivateEvent[];
  settled: boolean;
  resolve(result: AppServerWorkflowResult): void;
  reject(error: unknown): void;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identifiers(params: unknown): { threadId?: string; turnId?: string } {
  const root = record(params);
  const turn = record(root?.turn);
  return {
    ...(typeof root?.threadId === 'string' ? { threadId: root.threadId } : {}),
    ...(typeof root?.turnId === 'string'
      ? { turnId: root.turnId }
      : typeof turn?.id === 'string'
        ? { turnId: turn.id }
        : {}),
  };
}

function finalAgentResponse(value: unknown): string | undefined {
  const root = record(value);
  const turns = Array.isArray(root?.turns) ? root.turns : [];
  for (const rawTurn of [...turns].reverse()) {
    const items = Array.isArray(record(rawTurn)?.items)
      ? (record(rawTurn)?.items as unknown[])
      : [];
    for (const rawItem of [...items].reverse()) {
      const item = record(rawItem);
      if (
        (item?.type === 'agentMessage' || item?.type === 'agent_message') &&
        typeof item.text === 'string'
      )
        return item.text;
    }
  }
  return undefined;
}

function recoveredFinalItem(value: unknown, binding: AppServerWorkflowBinding) {
  const thread = record(value);
  const validId = (id: unknown): id is string =>
    typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(id);
  if (
    thread?.id !== binding.threadId ||
    !validId(binding.threadId) ||
    !validId(binding.turnId)
  )
    return undefined;
  const turns = Array.isArray(thread.turns)
    ? thread.turns.map(record).filter((turn) => turn?.id === binding.turnId)
    : [];
  if (turns.length !== 1 || turns[0]?.status !== 'completed') return undefined;
  const items = Array.isArray(turns[0].items) ? turns[0].items.map(record) : [];
  const item = [...items]
    .reverse()
    .find(
      (item) =>
        (item?.type === 'agentMessage' || item?.type === 'agent_message') &&
        (item.phase === 'final_answer' || item.phase == null) &&
        typeof item.text === 'string',
    );
  if (
    !item ||
    !validId(item.id) ||
    items.filter((candidate) => candidate?.id === item.id).length !== 1
  )
    return undefined;
  return {
    id: item.id,
    type: 'agentMessage',
    text: String(item.text),
    phase: item.phase === 'final_answer' ? 'final_answer' : null,
  };
}

export function createAppServerWorkflowExecutor(
  options: AppServerWorkflowExecutorOptions,
) {
  const tempRelative = relative(options.cwd, options.tempDirectory);
  if (
    !isAbsolute(options.cwd) ||
    !isAbsolute(options.tempDirectory) ||
    resolve(options.tempDirectory) !== options.tempDirectory ||
    !/^\.codex-workspace-tmp(?:-[A-Za-z0-9]{6})?$/.test(tempRelative)
  )
    throw new Error('App Server workflow temp directory is invalid.');
  const active = new Map<string, ActiveTurn>();
  const feedAbort = new AbortController();
  let closing = false;
  let feedFailed = false;
  let feed = pump();
  let recoveryUsed = false;
  const stopObligations = new Map<
    string,
    {
      threadId: string;
      turnId?: string;
      status: 'pending' | 'confirmed' | 'unknown';
    }
  >();

  async function bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('App Server recovery timed out.')),
            2_000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function stop(state: ActiveTurn, error: unknown): Promise<void> {
    if (state.settled || stopObligations.has(state.threadId)) return;
    const obligation = {
      threadId: state.threadId,
      ...(state.turnId ? { turnId: state.turnId } : {}),
      status: 'pending' as 'pending' | 'confirmed' | 'unknown',
    };
    stopObligations.set(state.threadId, obligation);
    try {
      const confirmed = await bounded(
        (async () => {
          if (!state.turnId) throw new Error('Turn identity unavailable.');
          await options.connection.request('turn/interrupt', {
            threadId: state.threadId,
            turnId: state.turnId,
          });
          const snapshot = await options.connection.request<{
            thread?: { status?: { type?: string } };
          }>('thread/read', { threadId: state.threadId, includeTurns: false });
          return snapshot.thread?.status?.type === 'idle';
        })(),
      );
      obligation.status = confirmed ? 'confirmed' : 'unknown';
    } catch {
      obligation.status = 'unknown';
    }
    // Retain unknown obligations even after the local result settles; RPC acknowledgement alone is not cessation.
    const failure =
      error instanceof Error ? error : new Error('App Server workflow failed.');
    settle(
      state,
      undefined,
      Object.assign(failure, { stopStatus: obligation.status }),
    );
  }

  async function emit(
    state: ActiveTurn,
    event: AppServerWorkflowRuntimeEvent,
  ): Promise<void> {
    await state.request.onRuntimeEvent(event);
  }

  function settle(
    state: ActiveTurn,
    result?: AppServerWorkflowResult,
    error?: unknown,
  ): void {
    if (state.settled) return;
    state.settled = true;
    active.delete(state.threadId);
    if (error === undefined && result) {
      attestedEvents.set(result, Object.freeze([...state.privateEvents]));
      state.resolve(result);
    } else state.reject(error ?? new Error('APP_SERVER_WORKFLOW_FAILED'));
  }

  async function notification(message: AppServerInboundMessage): Promise<void> {
    if (message.kind === 'server-request') {
      await options.connection.respond(message.id, {
        error: {
          code: -32000,
          message:
            'Non-interactive workflow execution cannot answer server requests.',
        },
      });
      return;
    }
    const ids = identifiers(message.params);
    const state = ids.threadId ? active.get(ids.threadId) : undefined;
    if (!state) return;
    if (state.turnId && ids.turnId && state.turnId !== ids.turnId) return;
    if (options.onObservation) {
      const observation = mapAppServerVisibility(message, {
        threadId: state.threadId,
        turnId: ids.turnId ?? state.turnId,
      });
      if (observation) {
        try {
          await options.onObservation({
            ...observation,
            nodeId: state.request.node.id,
            threadId: state.threadId,
            ...((ids.turnId ?? state.turnId)
              ? { turnId: ids.turnId ?? state.turnId }
              : {}),
          });
        } catch (error) {
          // Persistence failure must not silently leave this observer's turn running.
          state.turnId ??= ids.turnId;
          await stop(state, error);
          return;
        }
      }
    }
    if (message.method === 'item/completed') {
      const item = record(record(message.params)?.item);
      if (typeof item?.id === 'string' && typeof item.type === 'string') {
        state.privateEvents.push({
          type: 'item.completed',
          threadId: state.threadId,
          item: {
            id: item.id,
            type: item.type,
            ...(typeof item.text === 'string' ? { text: item.text } : {}),
            ...(typeof item.command === 'string'
              ? { command: item.command }
              : {}),
            ...(typeof item.status === 'string' ? { status: item.status } : {}),
            ...(typeof item.exitCode === 'number'
              ? { exitCode: item.exitCode }
              : typeof item.exit_code === 'number'
                ? { exitCode: item.exit_code }
                : {}),
          },
        });
      }
      if (
        (item?.type === 'agentMessage' || item?.type === 'agent_message') &&
        typeof item.text === 'string'
      )
        state.finalResponse = item.text;
      await emit(state, {
        type: 'item.completed',
        nodeId: state.request.node.id,
        threadId: state.threadId,
        ...(state.turnId ? { turnId: state.turnId } : {}),
        ...(typeof item?.type === 'string' ? { itemType: item.type } : {}),
      });
      return;
    }
    if (message.method !== 'turn/completed') return;
    const turn = record(record(message.params)?.turn);
    const status = String(turn?.status ?? 'completed');
    if (status === 'interrupted') {
      await emit(state, {
        type: 'turn.interrupted',
        nodeId: state.request.node.id,
        threadId: state.threadId,
        ...(state.turnId ? { turnId: state.turnId } : {}),
      });
      settle(
        state,
        undefined,
        Object.assign(new Error('Workflow turn interrupted.'), {
          code: 'WORKFLOW_CANCELLED',
        }),
      );
      return;
    }
    if (status !== 'completed') {
      settle(state, undefined, new Error('App Server workflow turn failed.'));
      return;
    }
    state.privateEvents.push({
      type: 'turn.completed',
      threadId: state.threadId,
    });
    await emit(state, {
      type: 'turn.completed',
      nodeId: state.request.node.id,
      threadId: state.threadId,
      ...(state.turnId ? { turnId: state.turnId } : {}),
    });
    settle(state, {
      threadId: state.threadId,
      finalResponse: state.finalResponse,
      usage: (turn?.usage as AppServerJson | undefined) ?? null,
    });
  }

  async function reconcile(): Promise<boolean> {
    if (recoveryUsed) throw new Error('App Server recovery budget exhausted.');
    recoveryUsed = true;
    await bounded(options.connection.reconnect());
    for (const state of [...active.values()]) {
      let response = await bounded(
        options.connection.request<{
          thread?: { status?: { type?: string }; turns?: unknown[] };
        }>('thread/read', { threadId: state.threadId, includeTurns: false }),
      );
      await emit(state, {
        type: 'runtime.reconnected',
        nodeId: state.request.node.id,
        threadId: state.threadId,
        ...(state.turnId ? { turnId: state.turnId } : {}),
      });
      const status = response.thread?.status?.type;
      if (status === 'active') continue;
      response = await bounded(
        options.connection.request<{
          thread?: { status?: { type?: string }; turns?: unknown[] };
        }>('thread/read', { threadId: state.threadId, includeTurns: true }),
      );
      const finalResponse = finalAgentResponse(response.thread);
      if (finalResponse !== undefined)
        settle(state, { threadId: state.threadId, finalResponse, usage: null });
      else
        settle(
          state,
          undefined,
          new Error(
            'App Server reconnect could not reconcile the bound workflow turn.',
          ),
        );
    }
    return active.size > 0;
  }

  async function pump(): Promise<void> {
    try {
      for await (const message of options.connection.messages({
        signal: feedAbort.signal,
      }))
        await notification(message);
      if (!closing && active.size > 0 && (await reconcile())) feed = pump();
    } catch (error) {
      if (!closing && active.size > 0) {
        try {
          if (record(error)?.code === 'MESSAGE_TOO_LARGE') {
            // Reconnect only to deliver cessation, never replay the oversized history.
            if (!recoveryUsed) {
              recoveryUsed = true;
              await bounded(options.connection.reconnect());
            }
          } else {
            if (await reconcile()) feed = pump();
            return;
          }
        } catch {
          /* Preserve the original failure, not the secondary recovery error. */
        }
      }
      feedFailed = true;
      await Promise.all(
        [...active.values()].map((state) => stop(state, error)),
      );
    }
  }

  return {
    async executeAgent(
      request: AppServerWorkflowRequest,
    ): Promise<AppServerWorkflowResult> {
      const target = request.existingThread ?? request.node.existingThread;
      const validManaged = !target && typeof request.model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$/.test(request.model) && typeof request.reasoning === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(request.reasoning) && (request.node.networkAccess === undefined || typeof request.node.networkAccess === 'boolean');
      const validAdopted = target && request.model === undefined && request.reasoning === undefined && request.node.networkAccess === undefined;
      if (!validManaged && !validAdopted) {
        throw Object.assign(new Error('Invalid agent runtime profile.'), {
          code: 'WORKFLOW_DEFINITION_INVALID',
        });
      }
      if (closing || feedFailed || request.signal.aborted)
        throw Object.assign(new Error('Workflow turn interrupted.'), {
          code: 'WORKFLOW_CANCELLED',
        });
      const networkAccess = request.node.networkAccess ?? true;
      let threadId: string;
      let adoptedActiveTurnId: string | undefined;
      if (target) {
        const snapshot = await options.connection.request<{ thread?: { id?: string; cwd?: string; status?: { type?: string }; turns?: Array<{ id?: string; status?: string }> } }>('thread/read', { threadId: target.threadId, includeTurns: true });
        if (snapshot.thread?.id !== target.threadId || typeof snapshot.thread.cwd !== 'string') throw Object.assign(new Error('Existing workflow thread is unavailable.'), { code: 'WORKFLOW_RUNTIME_UNAVAILABLE' });
        if (options.authorizeExisting) await options.authorizeExisting(target, snapshot.thread.cwd);
        else if (snapshot.thread.cwd !== options.cwd) throw Object.assign(new Error('Existing workflow thread is outside the admitted workspace.'), { code: 'WORKFLOW_RUNTIME_UNAVAILABLE' });
        adoptedActiveTurnId = snapshot.thread.status?.type === 'active' ? [...(snapshot.thread.turns ?? [])].reverse().find((turn) => turn.status === 'inProgress')?.id : undefined;
        if (adoptedActiveTurnId && (target.activeTurn.behavior === 'reject' || target.activeTurn.expectedTurnId !== adoptedActiveTurnId)) throw Object.assign(new Error('Existing workflow thread has a conflicting active turn.'), { code: 'WORKFLOW_RUNTIME_UNAVAILABLE' });
        if (!adoptedActiveTurnId && target.activeTurn.behavior === 'steer') throw Object.assign(new Error('Expected workflow turn is no longer active.'), { code: 'WORKFLOW_RUNTIME_UNAVAILABLE' });
        if (!adoptedActiveTurnId) await options.connection.request('thread/resume', { threadId: target.threadId });
        threadId = target.threadId;
      } else {
        const started = await options.connection.request<{ thread: { id: string; sessionId?: string } }>('thread/start', {
          model: request.model as string, cwd: options.cwd, approvalPolicy: options.approvalPolicy,
          sandbox: options.sandbox === 'workspaceWrite' ? 'workspace-write' : 'read-only', serviceName: 'codex-workflows',
          config: { shell_environment_policy: { set: { TMPDIR: options.tempDirectory, TMP: options.tempDirectory, TEMP: options.tempDirectory } } },
        });
        threadId = started.thread.id;
      }
      if (closing || feedFailed || request.signal.aborted)
        throw Object.assign(new Error('Workflow execution is unavailable.'), {
          code: 'WORKFLOW_CANCELLED',
        });
      await request.onRuntimeEvent({
        type: 'thread.started',
        nodeId: request.node.id,
        threadId,
      });
      if (active.has(threadId)) throw Object.assign(new Error('Workflow thread is already active.'), { code: 'WORKFLOW_RUNTIME_UNAVAILABLE' });
      let state!: ActiveTurn;
      const result = new Promise<AppServerWorkflowResult>((resolve, reject) => {
        state = {
          request,
          threadId,
          finalResponse: '',
          privateEvents: [
            { type: 'thread.started', threadId },
          ],
          settled: false,
          resolve,
          reject,
        };
        active.set(state.threadId, state);
      });
      try {
        const turn = adoptedActiveTurnId
          ? { turn: { id: (await options.connection.request<{ turnId: string }>('turn/steer', { threadId: state.threadId, input: [{ type: 'text', text: request.prompt }], expectedTurnId: adoptedActiveTurnId })).turnId } }
          : await options.connection.request<{ turn: { id: string } }>('turn/start', target ? {
            threadId: state.threadId,
            input: [{ type: 'text', text: request.prompt }],
          } : {
            threadId: state.threadId,
            input: [{ type: 'text', text: request.prompt }],
            model: request.model as string,
            effort: request.reasoning as string,
            sandboxPolicy:
              options.sandbox === 'workspaceWrite'
                ? {
                    type: 'workspaceWrite',
                    writableRoots: [options.cwd, options.tempDirectory],
                    networkAccess,
                    excludeTmpdirEnvVar: true,
                    excludeSlashTmp: true,
                  }
                : { type: 'readOnly', networkAccess },
            ...(request.outputSchema
              ? { outputSchema: request.outputSchema }
              : {}),
          });
        state.turnId = turn.turn.id;
        if (closing || feedFailed || request.signal.aborted) {
          await stop(
            state,
            Object.assign(new Error('Workflow turn interrupted.'), {
              code: 'WORKFLOW_CANCELLED',
            }),
          );
          return await result;
        }
        state.privateEvents.push({
          type: 'turn.started',
          threadId: state.threadId,
        });
        await emit(state, {
          type: 'turn.started',
          nodeId: request.node.id,
          threadId: state.threadId,
          turnId: state.turnId,
        });
        const interrupt = () =>
          void options.connection
            .request('turn/interrupt', {
              threadId: state.threadId,
              turnId: turn.turn.id,
            })
            .catch(() => undefined);
        request.signal.addEventListener('abort', interrupt, { once: true });
        try {
          return await result;
        } finally {
          request.signal.removeEventListener('abort', interrupt);
        }
      } catch (error) {
        settle(state, undefined, error);
        return await result;
      }
    },
    async reconcileAgent(
      request: AppServerWorkflowRequest,
      binding: AppServerWorkflowBinding,
    ): Promise<AppServerWorkflowResult> {
      if (binding.nodeId !== request.node.id)
        throw new Error('App Server workflow binding does not match the node.');
      await options.connection.request('thread/resume', {
        threadId: binding.threadId,
      });
      const snapshot = await options.connection.request<{
        thread?: { status?: { type?: string }; turns?: unknown[] };
      }>('thread/read', { threadId: binding.threadId, includeTurns: true });
      await request.onRuntimeEvent({
        type: 'runtime.reconnected',
        nodeId: request.node.id,
        threadId: binding.threadId,
        ...(binding.turnId ? { turnId: binding.turnId } : {}),
      });
      const recoveredItem = recoveredFinalItem(snapshot.thread, binding);
      const recovered =
        recoveredItem?.text ?? finalAgentResponse(snapshot.thread);
      if (snapshot.thread?.status?.type !== 'active') {
        if (recovered === undefined)
          throw new Error(
            'App Server workflow binding has no completed output.',
          );
        if (recoveredItem && binding.turnId && options.onObservation) {
          const observation = mapAppServerVisibility({
            kind: 'notification',
            method: 'item/completed',
            params: {
              threadId: binding.threadId,
              turnId: binding.turnId,
              item: recoveredItem,
            },
          });
          if (observation)
            await options.onObservation({
              ...observation,
              nodeId: request.node.id,
              threadId: binding.threadId,
              turnId: binding.turnId,
            });
        }
        return {
          threadId: binding.threadId,
          finalResponse: recovered,
          usage: null,
        };
      }
      let state!: ActiveTurn;
      const result = new Promise<AppServerWorkflowResult>((resolve, reject) => {
        state = {
          request,
          threadId: binding.threadId,
          ...(binding.turnId ? { turnId: binding.turnId } : {}),
          finalResponse: recovered ?? '',
          privateEvents: [],
          settled: false,
          resolve,
          reject,
        };
        active.set(binding.threadId, state);
      });
      const interrupt = () =>
        binding.turnId
          ? void options.connection
              .request('turn/interrupt', {
                threadId: binding.threadId,
                turnId: binding.turnId,
              })
              .catch(() => undefined)
          : undefined;
      request.signal.addEventListener('abort', interrupt, { once: true });
      try {
        return await result;
      } finally {
        request.signal.removeEventListener('abort', interrupt);
        active.delete(binding.threadId);
      }
    },
    metrics() {
      return { activeTurns: active.size, closed: closing };
    },
    stopObligations() {
      return [...stopObligations.values()].map((obligation) => ({
        ...obligation,
      }));
    },
    async close() {
      closing = true;
      feedAbort.abort();
      await Promise.all(
        [...active.values()].map((state) =>
          stop(state, new Error('App Server workflow executor closed.')),
        ),
      );
      await feed.catch(() => undefined);
    },
  };
}
