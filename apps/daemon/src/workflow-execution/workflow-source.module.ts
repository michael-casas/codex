import { isAbsolute, join } from 'node:path';
import {
  createWorkflowSourceSubmission,
  prepareWorkflowRun,
  type RunWorkflowCommand,
  type WorkflowSourceContext,
  WorkflowSourceAdmissionError,
} from '@codex/workflows';
import {
  compileWorkflowSource,
  loadCompiledWorkflowSource,
} from '@codex/workflows/source';

export interface WorkflowSourceRegistration {
  readonly actorAgentId: string;
  readonly hostId: string;
  readonly repositoryId: string;
  readonly assignmentId: string;
  readonly baseRevision: string;
  readonly sourceRoot: string;
  readonly runtimeProfile: RunWorkflowCommand['runtimeProfile'];
}
interface Repository {
  readonly hostId: string;
  readonly repositoryId: string;
  readonly checkoutPath: string;
}

export function parseWorkflowSourceRegistrations(
  value: unknown,
): readonly WorkflowSourceRegistration[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new WorkflowSourceAdmissionError('WORKFLOW_CONTEXT_INVALID');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new WorkflowSourceAdmissionError('WORKFLOW_CONTEXT_INVALID');
    const fields = entry as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 7 ||
      Object.keys(fields).some(
        (key) =>
          ![
            'actorAgentId',
            'hostId',
            'repositoryId',
            'assignmentId',
            'baseRevision',
            'runtimeProfile',
            'sourceRoot',
          ].includes(key),
      ) ||
      typeof fields.sourceRoot !== 'string' ||
      !isAbsolute(fields.sourceRoot) ||
      typeof fields.actorAgentId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(fields.actorAgentId)
    )
      throw new WorkflowSourceAdmissionError('WORKFLOW_CONTEXT_INVALID');
    const registration = fields as unknown as WorkflowSourceRegistration;
    prepareWorkflowRun({
      workflowRef: 'context.validation',
      sourceDigest: `sha256:${'0'.repeat(64)}`,
      input: {},
      hostId: registration.hostId,
      workspace: {
        repositoryId: registration.repositoryId,
        assignmentId: registration.assignmentId,
        baseRevision: registration.baseRevision,
      },
      runtimeProfile: registration.runtimeProfile,
      idempotencyKey: 'context.validation',
    });
    return registration;
  });
}

export function createWorkflowSourceModule(
  registrations: readonly WorkflowSourceRegistration[],
  repositories: readonly Repository[],
  submit: (command: RunWorkflowCommand) => Promise<unknown>,
) {
  const contexts = registrations.map((registration) => {
    const repository = repositories.find(
      (candidate) =>
        candidate.hostId === registration.hostId &&
        candidate.repositoryId === registration.repositoryId,
    );
    if (!repository)
      throw new WorkflowSourceAdmissionError(
        'WORKFLOW_CONTEXT_REPOSITORY_MISSING',
      );
    const context: WorkflowSourceContext = {
      hostId: registration.hostId,
      sourceRoot: registration.sourceRoot,
      artifactDirectory: join(
        registration.sourceRoot,
        '.agent',
        'workflow-modules',
      ),
      workspace: {
        repositoryId: registration.repositoryId,
        assignmentId: registration.assignmentId,
        baseRevision: registration.baseRevision,
      },
      runtimeProfile: registration.runtimeProfile,
    };
    return { actorAgentId: registration.actorAgentId, context };
  });
  const submitSource = createWorkflowSourceSubmission({
    async resolveContext(actorAgentId, hostId) {
      const matches = contexts.filter(
        (entry) =>
          entry.actorAgentId === actorAgentId &&
          (hostId === undefined || entry.context.hostId === hostId),
      );
      const match = matches[0];
      if (matches.length !== 1 || !match)
        throw new WorkflowSourceAdmissionError(
          matches.length
            ? 'WORKFLOW_CONTEXT_AMBIGUOUS'
            : 'WORKFLOW_CONTEXT_MISSING',
        );
      return match.context;
    },
    compileSource: compileWorkflowSource,
    submit,
  });
  return {
    submitSource,
    async resolveSource(workflowRef: string) {
      for (const directory of new Set(
        contexts.map((entry) => entry.context.artifactDirectory),
      )) {
        try {
          return await loadCompiledWorkflowSource(directory, workflowRef);
        } catch (error) {
          if (
            !(
              error &&
              typeof error === 'object' &&
              'code' in error &&
              error.code === 'ENOENT'
            )
          )
            throw error;
        }
      }
      throw new WorkflowSourceAdmissionError('WORKFLOW_SOURCE_NOT_FOUND');
    },
  };
}
