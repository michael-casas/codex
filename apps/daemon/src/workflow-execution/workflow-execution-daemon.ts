import { classifyObservationError } from '../visibility/observation-error.js';
import { createHash } from 'node:crypto';

import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
} from '@codex/codex';
import { PostgresControlStore, type ExecuteControlCommand } from '@codex/db';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import {
  createDurableWorkflowClient,
  createRuntimeVisibilityIngestor,
  type AgentAuthorization,
} from '@codex/process';
import {
  executeWorkflow,
  prepareWorkflowRun,
  type RunWorkflowCommand,
  type WorkflowAgentExecutionRequest,
  type WorkflowAgentExecutionResult,
  type WorkflowDefinition,
  type WorkflowPublicEvent,
  type WorkflowRuntimeEvent,
} from '@codex/workflows';
import { workflowVisibilityAgentId } from '../visibility/control-visibility.projector.js';

type ControlStore = Pick<PostgresControlStore, 'execute' | 'events'> &
  Partial<Pick<PostgresControlStore, 'subscribe'>>;
type Delivery = Pick<
  PgBossDeliveryRuntime,
  'start' | 'stop' | 'ensureQueue' | 'work'
>;

export interface WorkflowRuntimeExecutor {
  executeAgent(
    request: WorkflowAgentExecutionRequest,
  ): Promise<WorkflowAgentExecutionResult>;
  reconcileAgent?(
    request: WorkflowAgentExecutionRequest,
    binding: WorkflowRuntimeBinding,
  ): Promise<WorkflowAgentExecutionResult>;
  close(): Promise<void>;
}

export interface WorkflowRuntimeBinding {
  readonly nodeId: string;
  readonly threadId: string;
  readonly turnId?: string;
}

export interface WorkflowExecutionDaemonDependencies {
  readonly store: ControlStore;
  readonly delivery: Delivery;
  readonly hosts: { connect(hostId: string): Promise<unknown> };
  readonly workspaces: {
    acquire(
      input: RunWorkflowCommand['workspace'] & {
        hostId: string;
        executionId?: string;
      },
    ): Promise<{ workspaceRef: string }>;
    resolve(
      workspaceRef: string,
    ): Promise<{ cwd: string; tempDirectory: string }>;
    release(workspaceRef: string): Promise<void>;
  };
  readonly resolveWorkflow: (workflowRef: string) => Promise<{
    definition: WorkflowDefinition;
    sourceDigest: `sha256:${string}`;
  }>;
  readonly registerRuntime?: (
    runtime: { agentId: string; hostId: string; threadId: string },
    ownerAgentId: string,
  ) => Promise<void>;
  readonly createExecutor: (input: {
    connection: unknown;
    cwd: string;
    tempDirectory: string;
    runtimeProfile: RunWorkflowCommand['runtimeProfile'];
    onObservation: (event: Record<string, unknown>) => Promise<void>;
  }) => WorkflowRuntimeExecutor;
}

export interface WorkflowRunHandle {
  readonly runId: string;
  readonly state: 'accepted' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly cursor: string;
  readonly result?: unknown;
  readonly nodes?: readonly unknown[];
  readonly artifacts?: readonly unknown[];
}

function uuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function payload(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

function terminal(kind: string): boolean {
  return (
    kind === 'workflow.completed' ||
    kind === 'workflow.failed' ||
    kind === 'workflow.cancelled'
  );
}

export function createWorkflowExecutionDaemon(
  deps: WorkflowExecutionDaemonDependencies,
) {
  const controllers = new Map<string, AbortController>();
  const commandClient = createDurableWorkflowClient({
    store: deps.store,
    prepare: prepareWorkflowRun,
  });
  let started = false;

  async function append(
    runId: string,
    key: string,
    kind: string,
    eventPayload: Record<string, unknown>,
    artifacts?: ExecuteControlCommand['artifacts'],
  ): Promise<void> {
    await deps.store.execute({
      commandId: uuid(`${runId}:${key}:command`),
      streamId: `workflow:${runId}`,
      idempotencyKey: `workflow:${runId}:${key}`,
      kind,
      payload: eventPayload,
      events: [
        { eventId: uuid(`${runId}:${key}:event`), kind, payload: eventPayload },
      ],
      ...(artifacts ? { artifacts } : {}),
    });
  }

  async function watchCancellation(
    runId: string,
    afterCursor: string,
    controller: AbortController,
    signal: AbortSignal,
  ): Promise<void> {
    if (!deps.store.subscribe) return;
    try {
      for await (const event of deps.store.subscribe(
        `workflow:${runId}`,
        afterCursor,
        signal,
      )) {
        if (event.kind !== 'workflow.cancel.requested') continue;
        controller.abort();
        return;
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  async function execute(
    data: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const prepared = prepareWorkflowRun(data.command);
    if (data.runId !== prepared.runId) throw new Error('WORKFLOW_JOB_INVALID');
    const prior = await deps.store.events(`workflow:${prepared.runId}`, '0');
    if (prior.some(({ kind }) => terminal(kind))) return;
    if (prior.some(({ kind }) => kind === 'workflow.cancel.requested')) {
      await append(prepared.runId, 'cancelled', 'workflow.cancelled', {
        runId: prepared.runId,
      });
      return;
    }

    const attempt =
      prior.reduce((latest, event) => {
        const value = event.payload.attempt;
        return (event.kind === 'workflow.execution.attempted' ||
          event.kind === 'workflow.execution.started') &&
          typeof value === 'number' &&
          Number.isSafeInteger(value)
          ? Math.max(latest, value)
          : latest;
      }, 0) + 1;
    const admission = await deps.store.events(prepared.streamId, '0');
    const ownerAgentId = admission.find(
      ({ kind }) => kind === 'workflow.accepted',
    )?.payload.ownerAgentId;
    const registeredThreads = new Set<string>();
    const bindings = new Map<string, WorkflowRuntimeBinding>();
    for (const event of prior) {
      if (event.kind !== 'workflow.runtime.binding') continue;
      const nodeId = event.payload.nodeId;
      const threadId = event.payload.threadId;
      const turnId = event.payload.turnId;
      if (typeof nodeId === 'string' && typeof threadId === 'string')
        bindings.set(nodeId, {
          nodeId,
          threadId,
          ...(typeof turnId === 'string' ? { turnId } : {}),
        });
    }

    const controller = new AbortController();
    controllers.set(prepared.runId, controller);
    const cancellationWatchController = new AbortController();
    let watchError: unknown;
    const cancellationWatch = watchCancellation(
      prepared.runId,
      prior.at(-1)?.sequence.toString() ?? '0',
      controller,
      cancellationWatchController.signal,
    ).catch((error: unknown) => {
      watchError = error;
      controller.abort();
    });
    let lease: { workspaceRef: string } | undefined;
    let executor: WorkflowRuntimeExecutor | undefined;
    let visibilityOrdinal = 0;
    let observationOrdinal = 0;
    const observations = createRuntimeVisibilityIngestor({
      async ingest(event) {
        try {
          await append(
            prepared.runId,
            `attempt-${attempt}-visibility-${++visibilityOrdinal}`,
            'workflow.visibility.observed',
            {
              observation: {
                ...event,
                nodeId: observationNodes.get(event.agentId ?? ''),
              },
            },
          );
        } catch (error) {
          // Preserve the first persistence cause even if subsequent diagnostic writes
          // also fail. The provider stop path still receives the original error.
          console.error(
            JSON.stringify({
              event: 'workflow.observation.failure',
              runId: prepared.runId,
              attempt,
              stage: 'persist',
              observationOrdinal: visibilityOrdinal,
              occurredAt: new Date().toISOString(),
              ...classifyObservationError(error),
            }),
          );
          throw error;
        }
        return String(visibilityOrdinal);
      },
    });
    const observationNodes = new Map<string, string>();
    const finalItems = new Map<string, Record<string, unknown>>();
    const observe = async (event: Record<string, unknown>) => {
      if (typeof event.nodeId !== 'string')
        throw Error('VISIBILITY_NODE_REQUIRED');
      const agentId = workflowVisibilityAgentId(prepared.runId, event.nodeId);
      observationNodes.set(agentId, event.nodeId);
      const item = payload(event.item);
      if (
        item.operation === 'replace' &&
        item.itemType === 'agentMessage' &&
        (item.messagePhase === 'final_answer' || item.messagePhase == null)
      )
        finalItems.set(event.nodeId, item);
      await observations.observe({
        ...event,
        eventId: `observation:${attempt}:${++observationOrdinal}`,
        source: 'app-server',
        agentId,
        workflowId: prepared.runId,
        occurredAt: new Date().toISOString(),
      });
    };
    let stage = 'acquire';
    let primaryError: unknown;
    let cleanupError: unknown;
    const diagnostic = async (kind: string, stage: string, error: unknown) => {
      const code = payload(error).code;
      const safeCodes = [
        'INVALID_LEASE',
        'LEASE_CONFLICT',
        'LEASE_NOT_FOUND',
        'LEASE_OWNERSHIP_MISMATCH',
        'PROVIDER_FAILURE',
        'REVISION_MISMATCH',
        'UNSAFE_WORKSPACE',
        'WORKFLOW_SOURCE_DIGEST_MISMATCH',
      ];
      await append(
        prepared.runId,
        `attempt-${attempt}-${kind}-${stage}`,
        kind,
        {
          runId: prepared.runId,
          attempt,
          stage,
          code:
            typeof code === 'string' && safeCodes.includes(code)
              ? code
              : kind === 'workflow.cleanup.error'
                ? 'WORKFLOW_CLEANUP_FAILED'
                : 'WORKFLOW_SETUP_FAILED',
        },
      );
    };
    try {
      await append(
        prepared.runId,
        `attempt-${attempt}-attempted`,
        'workflow.execution.attempted',
        { runId: prepared.runId, attempt },
      );
      lease = await deps.workspaces.acquire({
        ...prepared.command.workspace,
        executionId: prepared.runId,
        hostId: prepared.command.hostId,
      });
      await append(
        prepared.runId,
        `attempt-${attempt}-started`,
        'workflow.execution.started',
        {
          runId: prepared.runId,
          attempt,
          hostId: prepared.command.hostId,
          workspaceRef: lease.workspaceRef,
        },
      );
      if (controller.signal.aborted && !watchError)
        throw new Error('WORKFLOW_SETUP_CANCELLED');
      stage = 'resolve';
      const [{ cwd, tempDirectory }, source, connection] = await Promise.all([
        deps.workspaces.resolve(lease.workspaceRef),
        deps.resolveWorkflow(prepared.command.workflowRef),
        deps.hosts.connect(prepared.command.hostId),
      ]);
      if (controller.signal.aborted && !watchError)
        throw new Error('WORKFLOW_SETUP_CANCELLED');
      if (watchError) throw watchError;
      if (source.sourceDigest !== prepared.command.sourceDigest)
        throw new Error('WORKFLOW_SOURCE_DIGEST_MISMATCH');
      stage = 'executor';
      executor = deps.createExecutor({
        connection,
        cwd,
        tempDirectory,
        runtimeProfile: prepared.command.runtimeProfile,
        onObservation: observe,
      });
      const runtimeExecutor = executor;
      const knownArtifacts = new Map<
        string,
        {
          name: string;
          path: string;
          digest: `sha256:${string}`;
          mediaType: string;
        }
      >();
      for (const event of prior) {
        if (event.kind !== 'workflow.artifact.registered') continue;
        const value = event.payload;
        if (
          typeof value.name === 'string' &&
          typeof value.path === 'string' &&
          typeof value.digest === 'string' &&
          typeof value.mediaType === 'string'
        )
          knownArtifacts.set(value.name, value as never);
      }
      let artifactOrdinal = 0;
      let runtimeOrdinal = 0;
      let ambiguousFailure = false;
      try {
        const result = await executeWorkflow(
          source.definition,
          prepared.command.input,
          {
            runId: prepared.runId,
            signal: controller.signal,
            async onAgentOutput({ node, output }) {
              const binding = finalItems.get(node.id);
              if (!binding || !node.outputSchemaDigest) {
                await observe({
                  nodeId: node.id,
                  kind: 'result.unavailable',
                  detail: {
                    type: 'message',
                    body: 'Validated result display unavailable: item provenance could not be verified.',
                  },
                });
                return;
              }
              let truncated = false;
              const entries =
                output !== null &&
                typeof output === 'object' &&
                !Array.isArray(output)
                  ? Object.entries(output)
                  : [['result', output]];
              const fields = entries.slice(0, 40).map(([name, value]) => {
                if (
                  value === null ||
                  ['string', 'number', 'boolean'].includes(typeof value)
                )
                  return { name, value };
                truncated = true;
                return {
                  name,
                  value: Array.isArray(value)
                    ? `Array (${value.length} items)`
                    : 'Structured object',
                };
              });
              await observe({
                nodeId: node.id,
                itemId: binding.itemId,
                kind: 'item.result',
                item: {
                  ...binding,
                  body: '',
                  operation: 'result',
                  messagePhase: 'final_answer',
                  fields,
                  schemaDigest: node.outputSchemaDigest,
                  truncated: truncated || entries.length > 40,
                  originalBytes: undefined,
                },
              });
            },
            executeAgent(request) {
              const binding = bindings.get(request.node.id);
              const operation =
                binding && runtimeExecutor.reconcileAgent
                  ? runtimeExecutor.reconcileAgent(request, binding)
                  : runtimeExecutor.executeAgent(request);
              return operation.catch(async (error: unknown) => {
                const diagnostic =
                  typeof error === 'object' && error !== null
                    ? (error as Record<string, unknown>)
                    : {};
                if (diagnostic.ambiguous === true) ambiguousFailure = true;
                await append(
                  prepared.runId,
                  `attempt-${attempt}-runtime-error-${request.node.id}`,
                  'workflow.runtime.error',
                  {
                    nodeId: request.node.id,
                    code:
                      typeof diagnostic.code === 'string'
                        ? diagnostic.code
                        : 'RUNTIME_ERROR',
                    ...(typeof diagnostic.method === 'string'
                      ? { method: diagnostic.method }
                      : {}),
                    ...(typeof diagnostic.providerCode === 'number'
                      ? { providerCode: diagnostic.providerCode }
                      : {}),
                    ambiguous: diagnostic.ambiguous === true,
                  },
                );
                throw error;
              });
            },
            onRuntimeEvent: async (event: WorkflowRuntimeEvent) => {
              const ordinal = ++runtimeOrdinal;
              const binding = bindings.get(event.nodeId);
              const threadId = event.threadId ?? binding?.threadId;
              const turnId = event.turnId ?? binding?.turnId;
              if (threadId) {
                if (
                  typeof ownerAgentId === 'string' &&
                  deps.registerRuntime &&
                  !registeredThreads.has(threadId)
                ) {
                  await deps.registerRuntime(
                    {
                      agentId: workflowVisibilityAgentId(
                        prepared.runId,
                        event.nodeId,
                      ),
                      hostId: prepared.command.hostId,
                      threadId,
                    },
                    ownerAgentId,
                  );
                  registeredThreads.add(threadId);
                }
                const next = {
                  nodeId: event.nodeId,
                  threadId,
                  ...(turnId ? { turnId } : {}),
                };
                bindings.set(event.nodeId, next);
                await append(
                  prepared.runId,
                  `attempt-${attempt}-binding-${ordinal}`,
                  'workflow.runtime.binding',
                  next,
                );
              }
              await append(
                prepared.runId,
                `attempt-${attempt}-runtime-${ordinal}`,
                'workflow.runtime.event',
                payload(event),
              );
            },
            onEvent: (event: WorkflowPublicEvent) =>
              append(
                prepared.runId,
                `attempt-${attempt}-event-${event.sequence}`,
                event.type === 'workflow.completed'
                  ? 'workflow.runtime.completed'
                  : event.type === 'workflow.failed'
                    ? 'workflow.runtime.failed'
                    : event.type === 'workflow.cancelled'
                      ? 'workflow.runtime.cancelled'
                      : event.type,
                payload(event),
              ),
            async writeArtifact(request) {
              artifactOrdinal += 1;
              const content = Buffer.from(
                typeof request.value === 'string'
                  ? request.value
                  : JSON.stringify(request.value),
              );
              const digest =
                `sha256:${createHash('sha256').update(content).digest('hex')}` as const;
              const existing = knownArtifacts.get(request.name);
              if (existing) {
                if (existing.digest !== digest)
                  throw new Error('WORKFLOW_ARTIFACT_CONFLICT');
                return existing;
              }
              const artifactId = uuid(
                `${prepared.runId}:artifact:${request.name}:${digest}`,
              );
              const artifact = {
                name: request.name,
                path: `control://${prepared.runId}/artifacts/${artifactId}`,
                digest,
                mediaType: request.mediaType ?? 'application/json',
              };
              await append(
                prepared.runId,
                `artifact-${artifactOrdinal}-${request.name}`,
                'workflow.artifact.registered',
                { runId: prepared.runId, ...artifact },
                [
                  {
                    artifactId,
                    kind: 'artifact',
                    mediaType: artifact.mediaType,
                    content,
                  },
                ],
              );
              knownArtifacts.set(request.name, artifact);
              return artifact;
            },
          },
        );
        await append(prepared.runId, 'completed', 'workflow.completed', {
          runId: prepared.runId,
          result: result.output,
          nodes: result.nodes.map(
            ({ id, dependencies, outcome, outputDigest }) => ({
              id,
              dependencies,
              outcome,
              outputDigest,
            }),
          ),
          artifacts: result.artifacts,
        });
      } catch (error) {
        if (watchError) throw watchError;
        if (controller.signal.aborted)
          await append(prepared.runId, 'cancelled', 'workflow.cancelled', {
            runId: prepared.runId,
          });
        else if (ambiguousFailure) throw error;
        else {
          const artifactFailed =
            payload(error).code === 'WORKFLOW_ARTIFACT_FAILED';
          const storageCode = payload(payload(error).details).storageCode;
          await append(prepared.runId, 'failed', 'workflow.failed', {
            runId: prepared.runId,
            diagnostic: artifactFailed ? 'artifact-failed' : 'execution-failed',
            ...(artifactFailed
              ? {
                  storageCode:
                    typeof storageCode === 'string' &&
                    [
                      '23514',
                      '23505',
                      '42501',
                      '22001',
                      '53100',
                      '53200',
                      '53300',
                      '08006',
                      '57P01',
                      'ECONNREFUSED',
                      'ETIMEDOUT',
                      'ENOSPC',
                      'EACCES',
                      'EIO',
                    ].includes(storageCode)
                      ? storageCode
                      : 'UNKNOWN',
                }
              : {}),
          });
        }
      }
    } catch (error) {
      primaryError = error;
      await diagnostic('workflow.execution.error', stage, error).catch(
        () => undefined,
      );
      if (controller.signal.aborted && !watchError) {
        await append(prepared.runId, 'cancelled', 'workflow.cancelled', {
          runId: prepared.runId,
        });
      } else throw error;
    } finally {
      cancellationWatchController.abort();
      await cancellationWatch;
      controllers.delete(prepared.runId);
      for (const [cleanupStage, cleanup] of [
        [
          'cancellation-watch',
          async () => {
            if (watchError) throw watchError;
          },
        ],
        ['executor', async () => executor?.close()],
        ['observations', async () => observations.stop()],
        [
          'release',
          async () => {
            if (!lease) return;
            if (
              primaryError &&
              bindings.size > 0 &&
              (!controller.signal.aborted || watchError)
            ) {
              await append(
                prepared.runId,
                `attempt-${attempt}-lease-retained`,
                'workflow.workspace.retained',
                {
                  runId: prepared.runId,
                  attempt,
                  reason: 'runtime-reconciliation-required',
                },
              );
              return;
            }
            await deps.workspaces.release(lease.workspaceRef);
          },
        ],
      ] as const) {
        try {
          await cleanup();
        } catch (error) {
          cleanupError ??= error;
          await diagnostic('workflow.cleanup.error', cleanupStage, error).catch(
            () => undefined,
          );
        }
      }
    }
    if (!primaryError && cleanupError) throw cleanupError;
  }

  const runWorkflow = async (
    command: RunWorkflowCommand,
    authorization?: AgentAuthorization,
  ) => {
    if (authorization && !authorization.scopes.includes('control:workflow'))
      throw new Error('WORKFLOW_UNAUTHORIZED');
    return commandClient.runWorkflow(command, authorization?.actorAgentId);
  };

  return {
    runWorkflow,
    run_workflow: runWorkflow,
    async readWorkflow(runId: string, afterCursor = '0') {
      return commandClient.readWorkflow(runId, afterCursor);
    },
    async cancelWorkflow(runId: string) {
      const current = await commandClient.cancelWorkflow(runId);
      const controller = controllers.get(runId);
      controller?.abort();
      if (
        !controller &&
        current.state !== 'completed' &&
        current.state !== 'failed' &&
        current.state !== 'cancelled'
      ) {
        await append(runId, 'cancelled', 'workflow.cancelled', { runId });
      }
      return commandClient.readWorkflow(runId, '0');
    },
    async start() {
      if (started) return;
      await deps.delivery.start();
      await deps.delivery.ensureQueue('workflow-execution');
      await deps.delivery.ensureQueue('workflow-execution-dead');
      await deps.delivery.work('workflow-execution-dead', async (data) => {
        const prepared = prepareWorkflowRun(data.command);
        if (data.runId !== prepared.runId)
          throw new Error('WORKFLOW_JOB_INVALID');
        const prior = await deps.store.events(
          `workflow:${prepared.runId}`,
          '0',
        );
        if (prior.some(({ kind }) => terminal(kind))) return;
        await append(prepared.runId, 'delivery-exhausted', 'workflow.failed', {
          runId: prepared.runId,
          diagnostic: 'delivery-exhausted',
        });
      });
      await deps.delivery.work('workflow-execution', execute);
      started = true;
    },
    async stop() {
      if (!started) return;
      for (const controller of controllers.values()) controller.abort();
      await deps.delivery.stop();
      started = false;
    },
  };
}

export function createProductionWorkflowExecutionDaemon(
  processDatabaseUrl: string,
  deliveryAdminDatabaseUrl: string,
  dependencies: Omit<
    WorkflowExecutionDaemonDependencies,
    'store' | 'delivery' | 'createExecutor'
  >,
) {
  const delivery = new PgBossDeliveryRuntime(
    processDatabaseUrl,
    deliveryAdminDatabaseUrl,
  );
  const store = new PostgresControlStore(processDatabaseUrl, delivery);
  return {
    ...createWorkflowExecutionDaemon({
      ...dependencies,
      store,
      delivery,
      createExecutor({
        connection,
        cwd,
        tempDirectory,
        runtimeProfile,
        onObservation,
      }) {
        const executor = createAppServerWorkflowExecutor({
          connection: connection as AppServerWorkflowConnection,
          cwd,
          tempDirectory,
          sandbox: runtimeProfile.sandbox,
          approvalPolicy: runtimeProfile.approvalPolicy,
          onObservation,
        });
        return {
          executeAgent: (request) => executor.executeAgent(request as never),
          reconcileAgent: (request, binding) =>
            executor.reconcileAgent(request as never, binding),
          close: () => executor.close(),
        };
      },
    }),
    store,
    delivery,
  };
}
