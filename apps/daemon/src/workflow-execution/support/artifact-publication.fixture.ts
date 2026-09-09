import { createHash } from 'node:crypto';
import {
  artifact,
  defineWorkflow,
  phase,
  prepareWorkflowRun,
} from '@codex/workflows';
import type { ExecuteControlCommand } from '@codex/db';
import type { ControlEvent } from '@codex/process';
import {
  createWorkflowExecutionDaemon,
  type WorkflowExecutionDaemonDependencies,
} from '../workflow-execution-daemon.js';

export const artifactNames = [
  'firstHalf.md',
  'README.md',
  'readme.md',
  'research/Second Half.md',
  'Résumé notes',
  'x'.repeat(160),
];
export const artifactContent = '# Fixture evidence\n';
export const artifactDigest = `sha256:${createHash('sha256').update(artifactContent).digest('hex')}`;
export const artifactCommand = {
  workflowRef: 'artifact.fixture',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  input: {},
  hostId: 'fixture',
  workspace: {
    repositoryId: 'fixture',
    baseRevision: 'b'.repeat(40),
    assignmentId: 'CAS-MEADOW-ARTIFACT-R1',
  },
  runtimeProfile: {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    sandbox: 'readOnly',
    approvalPolicy: 'never',
  },
  idempotencyKey: 'artifact-fixture',
} as const;

export function artifactDependencies(
  run = async () => {
    for (const name of artifactNames)
      await artifact(name, {
        value: artifactContent,
        mediaType: 'text/markdown',
      });
    await artifact(artifactNames[0], {
      value: artifactContent,
      mediaType: 'text/markdown',
    });
    return 'published';
  },
): Omit<WorkflowExecutionDaemonDependencies, 'store' | 'delivery'> {
  return {
    hosts: { connect: async () => ({}) },
    workspaces: {
      acquire: async () => ({ workspaceRef: 'artifact-fixture' }),
      resolve: async () => ({ cwd: '/fixture', tempDirectory: '/fixture/tmp' }),
      release: async () => undefined,
    },
    resolveWorkflow: async () => ({
      sourceDigest: artifactCommand.sourceDigest,
      definition: defineWorkflow({
        id: 'artifact-fixture',
        run: () => phase('Preserve fixture evidence', run),
      }),
    }),
    createExecutor: () => ({
      executeAgent: async () => {
        throw Error('PAID_TURNS_FORBIDDEN');
      },
      close: async () => undefined,
    }),
  };
}

export function artifactFixture(
  options: {
    store?: WorkflowExecutionDaemonDependencies['store'];
    run?: () => Promise<string>;
    reject?: unknown;
  } = {},
) {
  const events: ControlEvent[] = [];
  const commands: ExecuteControlCommand[] = [];
  const handlers = new Map<
    string,
    (data: Readonly<Record<string, unknown>>) => Promise<void>
  >();
  const store = options.store ?? {
    events: async (stream: string) =>
      events.filter((e) => e.streamId === stream),
    execute: async (command: ExecuteControlCommand) => {
      if (command.artifacts && options.reject) throw options.reject;
      commands.push(command);
      for (const event of command.events)
        events.push({
          ...event,
          streamId: command.streamId,
          sequence: BigInt(events.length + 1),
          idempotencyKey: command.idempotencyKey,
          payloadSha256: `sha256:${'0'.repeat(64)}`,
        });
      return {} as never;
    },
  };
  const service = createWorkflowExecutionDaemon({
    ...artifactDependencies(options.run),
    store,
    delivery: {
      start: async () => undefined,
      stop: async () => undefined,
      ensureQueue: async () => undefined,
      work: async (queue, handler) => {
        handlers.set(queue, handler);
        return queue;
      },
    },
  });
  const prepared = prepareWorkflowRun(artifactCommand);
  return {
    service,
    events,
    commands,
    prepared,
    async run() {
      await service.start();
      try {
        const handler = handlers.get('workflow-execution');
        if (!handler) throw Error('MISSING_WORKFLOW_HANDLER');
        await handler({ runId: prepared.runId, command: prepared.command });
      } finally {
        await service.stop();
      }
    },
  };
}
