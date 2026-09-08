import type { RunWorkflowCommand } from '../../../control/run-workflow.js';

export interface WorkflowSourceCommand {
  readonly source: string;
  readonly input?: unknown;
  readonly hostId?: string;
  readonly idempotencyKey: string;
}

export interface WorkflowSourceContext {
  readonly sourceRoot: string;
  readonly artifactDirectory: string;
  readonly hostId: string;
  readonly workspace: RunWorkflowCommand['workspace'];
  readonly runtimeProfile: RunWorkflowCommand['runtimeProfile'];
}

export interface WorkflowSourceIdentity {
  readonly workflowRef: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly display?: RunWorkflowCommand['display'];
}

export interface WorkflowSourceSubmissionDependencies {
  resolveContext(
    actorAgentId: string,
    hostId?: string,
  ): Promise<WorkflowSourceContext>;
  compileSource(
    source: string,
    context: WorkflowSourceContext,
  ): Promise<WorkflowSourceIdentity>;
  submit(command: RunWorkflowCommand): Promise<unknown>;
}
