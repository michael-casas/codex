import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

import { createControlDatabaseFixture } from '@codex/db/testing';
import {
  agent,
  artifact,
  defineWorkflow,
  parallel,
  phase,
  type RunWorkflowCommand,
} from '@codex/workflows';
import { loadCompiledWorkflowSource } from '@codex/workflows/source';
import { createWorkflowSourceModule } from '../workflow-source.module.js';

import { createProductionWorkflowExecutionDaemon } from '../workflow-execution-daemon.js';

async function workspaceRoot(): Promise<string> {
  let directory = process.cwd();
  while (true) {
    try {
      if (
        (
          await stat(resolve(directory, 'packages/workflows/package.json'))
        ).isFile()
      )
        return directory;
    } catch {
      /* keep walking */
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error('WORKSPACE_NOT_FOUND');
    directory = parent;
  }
}

export async function runRemoteWorkflowScenario(source?: {
  sourceRoot: string;
  source: string;
}) {
  const root = await workspaceRoot();
  const fixtureModule = (await import(
    pathToFileURL(
      resolve(
        root,
        'packages/delivery/dist/agent-messaging/support/controlled-wss-app-server.js',
      ),
    ).href
  )) as {
    createControlledWssAppServer(): Promise<{
      connection: unknown;
      close(): Promise<void>;
    }>;
  };
  const previousDirectory = process.cwd();
  process.chdir(root);
  let database: Awaited<ReturnType<typeof createControlDatabaseFixture>>;
  try {
    database = await createControlDatabaseFixture();
  } finally {
    process.chdir(previousDirectory);
  }
  let remote: Awaited<
    ReturnType<typeof fixtureModule.createControlledWssAppServer>
  >;
  try {
    remote = await fixtureModule.createControlledWssAppServer();
  } catch (error) {
    await database.close();
    throw error;
  }
  const sourceDigest = `sha256:${'c'.repeat(64)}` as const;
  const definition = defineWorkflow({
    id: 'cas07-remote',
    maxConcurrency: 2,
    async run() {
      const research = await phase('research', () =>
        parallel({
          north: () =>
            agent<{ fact: string }>({
              label: 'North research',
              model: 'gpt-5.6-sol',
              reasoning: 'medium',
              prompt: 'Return JSON only: {"fact":"N"}.',
              outputSchema: {
                type: 'object',
                properties: { fact: { type: 'string' } },
                required: ['fact'],
                additionalProperties: false,
              },
            }),
          south: () =>
            agent<{ fact: string }>({
              label: 'South research',
              model: 'gpt-5.6-sol',
              reasoning: 'medium',
              prompt: 'Return JSON only: {"fact":"X"}.',
              outputSchema: {
                type: 'object',
                properties: { fact: { type: 'string' } },
                required: ['fact'],
                additionalProperties: false,
              },
            }),
        }),
      );
      const implementation = await phase('implementation', () =>
        agent<{ result: string }, typeof research>({
          label: 'Implementation',
          model: 'gpt-5.6-sol',
          reasoning: 'medium',
          prompt:
            'Return JSON only with result equal to the concatenated input fact values.',
          input: research,
          outputSchema: {
            type: 'object',
            properties: { result: { type: 'string' } },
            required: ['result'],
            additionalProperties: false,
          },
        }),
      );
      await artifact('cas07-result.json', implementation);
      return implementation;
    },
  });
  let releases = 0;
  const dependencies = {
    hosts: {
      async connect() {
        return remote.connection;
      },
    },
    workspaces: {
      async acquire() {
        return { workspaceRef: `workspace:${'d'.repeat(64)}` };
      },
      async resolve() {
        return { cwd: root, tempDirectory: join(root, '.codex-workspace-tmp') };
      },
      async release() {
        releases += 1;
      },
    },
    async resolveWorkflow(workflowRef: string) {
      if (source && workflowRef.startsWith('source.'))
        return loadCompiledWorkflowSource(
          join(source.sourceRoot, '.agent', 'workflow-modules'),
          workflowRef,
        );
      return { definition, sourceDigest };
    },
  };
  const accepting = createProductionWorkflowExecutionDaemon(
    database.daemonUrl,
    database.ownerUrl,
    dependencies,
  );
  let service:
    | ReturnType<typeof createProductionWorkflowExecutionDaemon>
    | undefined;
  try {
    await accepting.delivery.start();
    await accepting.delivery.ensureQueue('workflow-execution');
    await accepting.delivery.ensureQueue('workflow-execution-dead');
    const command = {
      workflowRef: 'cas07.remote',
      sourceDigest,
      input: {},
      hostId: 'controlled-wss',
      workspace: {
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-07',
      },
      runtimeProfile: {
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'workspaceWrite',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'cas07-l2-remote',
    } as const;
    let effectiveCommand: RunWorkflowCommand = command;
    const sourceModule = source
      ? createWorkflowSourceModule(
          [
            {
              actorAgentId: 'source-owner',
              hostId: command.hostId,
              repositoryId: command.workspace.repositoryId,
              assignmentId: command.workspace.assignmentId,
              baseRevision: command.workspace.baseRevision,
              sourceRoot: source.sourceRoot,
              runtimeProfile: command.runtimeProfile,
            },
          ],
          [
            {
              hostId: command.hostId,
              repositoryId: command.workspace.repositoryId,
              checkoutPath: root,
            },
          ],
          async (admitted) => {
            effectiveCommand = admitted;
            return accepting.runWorkflow(admitted);
          },
        )
      : undefined;
    const submitted =
      sourceModule && source
        ? await sourceModule.submitSource(
            {
              source: source.source,
              idempotencyKey: command.idempotencyKey,
              input: {},
            },
            { actorAgentId: 'source-owner', scopes: ['control:workflow'] },
          )
        : await accepting.runWorkflow(command);
    if (
      !submitted ||
      typeof submitted !== 'object' ||
      !('runId' in submitted) ||
      typeof submitted.runId !== 'string'
    )
      throw new Error('WORKFLOW_HANDLE_INVALID');
    const handle = { runId: submitted.runId };
    await accepting.delivery.stop();
    service = createProductionWorkflowExecutionDaemon(
      database.daemonUrl,
      database.ownerUrl,
      dependencies,
    );
    await service.start();
    let observed = await service.readWorkflow(handle.runId);
    for (
      let index = 0;
      index < 240 &&
      !['completed', 'failed', 'cancelled'].includes(observed.state);
      index += 1
    ) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      observed = await service.readWorkflow(handle.runId);
    }
    const events = await service.store.events(`workflow:${handle.runId}`, '0');
    const north = events.find(
      ({ kind, payload }) =>
        kind === 'node.completed' &&
        payload.nodeId === 'cas07-remote:001:north-research',
    );
    const south = events.find(
      ({ kind, payload }) =>
        kind === 'node.completed' &&
        payload.nodeId === 'cas07-remote:002:south-research',
    );
    const implementation = events.find(
      ({ kind, payload }) =>
        kind === 'node.started' &&
        payload.nodeId === 'cas07-remote:003:implementation',
    );
    const stageOrdered = Boolean(
      north &&
        south &&
        implementation &&
        implementation.sequence > north.sequence &&
        implementation.sequence > south.sequence,
    );
    const artifactObserved = events.some(
      ({ kind, payload }) =>
        kind === 'workflow.artifact.registered' &&
        payload.name === 'cas07-result.json' &&
        typeof payload.digest === 'string',
    );
    const resultObserved =
      observed.state === 'completed' &&
      typeof (observed.result as { result?: unknown } | undefined)?.result ===
        'string';
    const serializedEvents = JSON.stringify(
      events.map(({ kind, payload }) => ({ kind, payload })),
    );
    const redacted =
      !serializedEvents.includes('Return JSON only') &&
      !serializedEvents.includes('<workflow-input-json>');
    const replay = await service.runWorkflow(effectiveCommand);
    return {
      handle,
      replay,
      observed,
      events,
      stageOrdered,
      artifactObserved,
      resultObserved,
      redacted,
      get releases() {
        return releases;
      },
      async close() {
        await service?.stop().catch(() => undefined);
        await remote.close();
        await database.close();
      },
    };
  } catch (error) {
    await accepting.delivery.stop().catch(() => undefined);
    await service?.stop().catch(() => undefined);
    await remote.close().catch(() => undefined);
    await database.close().catch(() => undefined);
    throw error;
  }
}

export async function runRemoteWorkflowCancellationScenario() {
  const root = await workspaceRoot();
  const fixtureModule = (await import(
    pathToFileURL(
      resolve(
        root,
        'packages/delivery/dist/agent-messaging/support/controlled-wss-app-server.js',
      ),
    ).href
  )) as {
    createControlledWssAppServer(): Promise<{
      connection: unknown;
      close(): Promise<void>;
    }>;
  };
  const previousDirectory = process.cwd();
  process.chdir(root);
  let database: Awaited<ReturnType<typeof createControlDatabaseFixture>>;
  try {
    database = await createControlDatabaseFixture();
  } finally {
    process.chdir(previousDirectory);
  }
  let remote: Awaited<
    ReturnType<typeof fixtureModule.createControlledWssAppServer>
  >;
  try {
    remote = await fixtureModule.createControlledWssAppServer();
  } catch (error) {
    await database.close();
    throw error;
  }
  const sourceDigest = `sha256:${'e'.repeat(64)}` as const;
  const definition = defineWorkflow({
    id: 'cas07-cancel',
    async run() {
      await phase('active', () =>
        agent({
          label: 'Long running',
          model: 'gpt-5.6-sol',
          reasoning: 'medium',
          prompt:
            'Run the shell command `sleep 30` now. After it completes, reply DONE.',
        }),
      );
      return phase('forbidden', () =>
        agent({
          label: 'Forbidden downstream',
          model: 'gpt-5.6-sol',
          reasoning: 'medium',
          prompt: 'Reply SHOULD_NOT_START.',
        }),
      );
    },
  });
  let releases = 0;
  const service = createProductionWorkflowExecutionDaemon(
    database.daemonUrl,
    database.ownerUrl,
    {
      hosts: {
        async connect() {
          return remote.connection;
        },
      },
      workspaces: {
        async acquire() {
          return { workspaceRef: `workspace:${'f'.repeat(64)}` };
        },
        async resolve() {
          return { cwd: root, tempDirectory: join(root, '.codex-workspace-tmp') };
        },
        async release() {
          releases += 1;
        },
      },
      async resolveWorkflow() {
        return { definition, sourceDigest };
      },
    },
  );
  try {
    await service.start();
    const handle = await service.runWorkflow({
      workflowRef: 'cas07.cancel',
      sourceDigest,
      input: {},
      hostId: 'controlled-wss',
      workspace: {
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-07',
      },
      runtimeProfile: {
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'workspaceWrite',
        approvalPolicy: 'never',
      },
      idempotencyKey: 'cas07-l2-cancel',
    });
    let events = await service.store.events(`workflow:${handle.runId}`, '0');
    for (
      let index = 0;
      index < 200 &&
      !events.some(
        ({ kind, payload }) =>
          kind === 'workflow.runtime.binding' &&
          typeof payload.turnId === 'string',
      );
      index += 1
    ) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      events = await service.store.events(`workflow:${handle.runId}`, '0');
    }
    if (
      !events.some(
        ({ kind, payload }) =>
          kind === 'workflow.runtime.binding' &&
          typeof payload.turnId === 'string',
      )
    )
      throw new Error('CAS07_ACTIVE_TURN_NOT_BOUND');
    await service.cancelWorkflow(handle.runId);
    let observed = await service.readWorkflow(handle.runId);
    for (
      let index = 0;
      index < 200 && observed.state !== 'cancelled';
      index += 1
    ) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      observed = await service.readWorkflow(handle.runId);
    }
    events = await service.store.events(`workflow:${handle.runId}`, '0');
    return {
      observed,
      interrupted: events.some(
        ({ kind, payload }) =>
          kind === 'workflow.runtime.event' &&
          payload.type === 'turn.interrupted',
      ),
      downstreamStarted: events.some(
        ({ kind, payload }) =>
          kind === 'node.started' &&
          payload.nodeId === 'cas07-cancel:002:forbidden-downstream',
      ),
      get releases() {
        return releases;
      },
      async close() {
        await service.stop().catch(() => undefined);
        await remote.close();
        await database.close();
      },
    };
  } catch (error) {
    await service.stop().catch(() => undefined);
    await remote.close().catch(() => undefined);
    await database.close().catch(() => undefined);
    throw error;
  }
}
