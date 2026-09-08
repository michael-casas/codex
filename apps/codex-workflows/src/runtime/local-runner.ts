import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  APP_SERVER_PROTOCOL_VERSION,
  connectAppServer,
  createAppServerWorkflowExecutor,
  type AppServerJson,
} from '@codex/codex';
import {
  canonicalizeJson,
  executeWorkflow,
  sha256,
  WorkflowExecutionError,
  type JsonValue,
  type WorkflowDefinition,
  type WorkflowPublicEvent,
} from '@codex/workflows';

import { createLocalRunJournal, type LocalRunJournal } from './journal.js';

export interface LocalRunRequest {
  definition: WorkflowDefinition<unknown, unknown>;
  sourcePath: string;
  sourceDigest: `sha256:${string}`;
  input: JsonValue;
  signal?: AbortSignal;
  journalRoot?: string;
  workingDirectory: string;
  onProgress?: (event: WorkflowPublicEvent) => void | Promise<void>;
}

export interface LocalRunResult {
  runId: string;
  journalPath: string;
  status: 'completed';
  output: unknown;
  nodes: number;
  artifacts: number;
}

function createRunId(
  sourceDigest: `sha256:${string}`,
  inputDigest: `sha256:${string}`,
  now: Date,
): string {
  const timestamp = now
    .toISOString()
    .replace(/[^0-9a-z]/gi, '')
    .toLowerCase();
  const entropy = sha256(
    `${sourceDigest}:${inputDigest}:${randomUUID()}`,
  ).slice('sha256:'.length, 'sha256:'.length + 12);
  return `local-${timestamp}-${entropy}`;
}

function defaultJournalRoot(): string {
  return (
    process.env.CODEX_WORKFLOWS_HOME ?? join(homedir(), '.codex', 'workflows')
  );
}

function errorWithJournal(
  error: WorkflowExecutionError,
  runId: string,
  journal: LocalRunJournal,
): WorkflowExecutionError {
  return new WorkflowExecutionError(error.code, error.message, {
    ...error.details,
    runId,
    journalPath: journal.journalPath,
  });
}

export async function runLocalWorkflow(
  request: LocalRunRequest,
): Promise<LocalRunResult> {
  const startedAt = new Date();
  const inputDigest = sha256(canonicalizeJson(request.input));
  const runId = createRunId(request.sourceDigest, inputDigest, startedAt);
  const journal = await createLocalRunJournal({
    root: request.journalRoot ?? defaultJournalRoot(),
    runId,
    workflowId: request.definition.id,
    sourcePath: request.sourcePath,
    sourceDigest: request.sourceDigest,
    inputDigest,
    startedAt: startedAt.toISOString(),
    workingDirectory: request.workingDirectory,
  });

  let client: Awaited<ReturnType<typeof connectAppServer>> | undefined;
  let executor: ReturnType<typeof createAppServerWorkflowExecutor> | undefined;
  let tempDirectory: string | undefined;
  try {
    tempDirectory = await mkdtemp(
      join(request.workingDirectory, '.codex-workspace-tmp-'),
    );
    client = await connectAppServer({
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      clientInfo: {
        name: 'codex-workflows',
        title: 'Codex Workflows',
        version: APP_SERVER_PROTOCOL_VERSION,
      },
      cwd: request.workingDirectory,
      env: { ...process.env },
      ...(process.env.CODEX_WORKFLOWS_CODEX_PATH
        ? { command: process.env.CODEX_WORKFLOWS_CODEX_PATH }
        : {}),
    });
    executor = createAppServerWorkflowExecutor({
      connection: {
        request<T = AppServerJson>(method: string, params?: AppServerJson) {
          return client!.request(method, params) as Promise<T>;
        },
        messages: (options) => client!.messages(options),
        respond: (id, response) => client!.respond(id, response),
        async reconnect() {
          throw new Error(
            'Direct stdio workflow execution cannot reconnect its App Server child.',
          );
        },
      },
      cwd: request.workingDirectory,
      sandbox: 'workspaceWrite',
      tempDirectory,
      approvalPolicy: 'never',
    });
    const result = await executeWorkflow(request.definition, request.input, {
      runId,
      ...(request.signal ? { signal: request.signal } : {}),
      async executeAgent(agentRequest) {
        const turn = await executor!.executeAgent({
          node: {
            id: agentRequest.node.id,
            model: agentRequest.model,
            reasoning: agentRequest.reasoning,
            networkAccess: agentRequest.node.networkAccess,
          },
          prompt: agentRequest.prompt,
          model: agentRequest.model,
          reasoning: agentRequest.reasoning,
          ...(agentRequest.outputSchema
            ? {
                outputSchema: agentRequest.outputSchema as Exclude<
                  AppServerJson,
                  null | boolean | number | string | AppServerJson[]
                >,
              }
            : {}),
          signal: agentRequest.signal,
          onRuntimeEvent: agentRequest.onRuntimeEvent,
        });
        return {
          threadId: turn.threadId,
          finalResponse: turn.finalResponse,
          usage: turn.usage,
          ...(agentRequest.commandEvidence ? { runtimeTurn: turn } : {}),
        };
      },
      writeArtifact: (artifact) => journal.writeArtifact(artifact),
      async onEvent(event) {
        await journal.record(event as unknown as Record<string, unknown>);
        await request.onProgress?.(event);
      },
    });
    await journal.finalize({
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    return {
      runId,
      journalPath: journal.journalPath,
      status: 'completed',
      output: result.output,
      nodes: result.nodes.length,
      artifacts: result.artifacts.length,
    };
  } catch (caught) {
    const error =
      caught instanceof WorkflowExecutionError
        ? caught
        : typeof caught === 'object' &&
            caught !== null &&
            'code' in caught &&
            String(caught.code).startsWith('WORKFLOW_')
          ? new WorkflowExecutionError(
              String(caught.code) as WorkflowExecutionError['code'],
              'Attributed local workflow execution failed.',
              'details' in caught &&
              typeof caught.details === 'object' &&
              caught.details !== null
                ? (caught.details as Record<string, unknown>)
                : undefined,
            )
          : new WorkflowExecutionError(
              'WORKFLOW_AGENT_FAILED',
              'Local workflow execution failed.',
            );
    await journal.finalize({
      status: error.code === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed',
      completedAt: new Date().toISOString(),
    });
    throw errorWithJournal(error, runId, journal);
  } finally {
    try {
      await executor?.close();
    } finally {
      try {
        await client?.close();
      } finally {
        if (tempDirectory)
          await rm(tempDirectory, { recursive: true, force: true });
      }
    }
  }
}
