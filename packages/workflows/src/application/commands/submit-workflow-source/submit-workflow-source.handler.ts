import { prepareWorkflowRun } from '../../../control/run-workflow.js';
import { sha256 } from '../../../normalization/canonical.js';
import type {
  WorkflowSourceCommand,
  WorkflowSourceSubmissionDependencies,
} from './submit-workflow-source.command.js';

export class WorkflowSourceAdmissionError extends Error {
  override readonly name = 'WorkflowSourceAdmissionError';
  constructor(readonly code: string) {
    super(code);
  }
}

function parseCommand(value: unknown): WorkflowSourceCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkflowSourceAdmissionError('WORKFLOW_SOURCE_COMMAND_INVALID');
  const command = value as Record<string, unknown>;
  if (
    Object.keys(command).some(
      (key) =>
        ![
          'source',
          'input',
          'hostId',
          'repositoryId',
          'idempotencyKey',
        ].includes(key),
    ) ||
    typeof command.source !== 'string' ||
    !command.source.trim() ||
    command.source.length > 4096 ||
    command.source.includes('\0') ||
    typeof command.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(command.idempotencyKey) ||
    ['hostId', 'repositoryId'].some(
      (key) =>
        command[key] !== undefined &&
        (typeof command[key] !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(command[key])),
    )
  ) {
    throw new WorkflowSourceAdmissionError('WORKFLOW_SOURCE_COMMAND_INVALID');
  }
  try {
    JSON.stringify(command.input ?? {});
  } catch {
    throw new WorkflowSourceAdmissionError('WORKFLOW_INPUT_INVALID');
  }
  return command as unknown as WorkflowSourceCommand;
}

export function createWorkflowSourceSubmission(
  dependencies: WorkflowSourceSubmissionDependencies,
) {
  return async (
    value: unknown,
    authorization: { actorAgentId: string; scopes: readonly string[] },
  ): Promise<unknown> => {
    if (
      !authorization?.actorAgentId ||
      !authorization.scopes?.includes('control:workflow')
    )
      throw new WorkflowSourceAdmissionError('WORKFLOW_SOURCE_UNAUTHORIZED');
    const command = parseCommand(value);
    const context = await (command.repositoryId === undefined
      ? dependencies.resolveContext(authorization.actorAgentId, command.hostId)
      : dependencies.resolveContext(
          authorization.actorAgentId,
          command.hostId,
          command.repositoryId,
        ));
    if (
      (command.hostId !== undefined && context.hostId !== command.hostId) ||
      (command.repositoryId !== undefined &&
        context.workspace.repositoryId !== command.repositoryId)
    )
      throw new WorkflowSourceAdmissionError('WORKFLOW_CONTEXT_INVALID');
    const envelope = {
      workflowRef: 'source.validation',
      sourceDigest: `sha256:${'0'.repeat(64)}` as const,
      input: command.input ?? {},
      hostId: context.hostId,
      workspace: context.workspace,
      runtimeProfile: context.runtimeProfile,
      idempotencyKey:
        command.repositoryId === undefined && context.projectScoped !== true
          ? command.idempotencyKey
          : sha256(
              JSON.stringify([
                'project-source-v1',
                authorization.actorAgentId,
                context.hostId,
                context.workspace.repositoryId,
                command.idempotencyKey,
              ]),
            ),
    };
    prepareWorkflowRun(envelope);
    const compiled = await dependencies.compileSource(command.source, context);
    const prepared = prepareWorkflowRun({ ...envelope, ...compiled });
    return dependencies.submit(prepared.command);
  };
}
