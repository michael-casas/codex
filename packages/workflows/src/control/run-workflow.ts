import {
  canonicalizeJson,
  deepFreeze,
  sha256,
} from '../normalization/canonical.js';
import type { JsonValue } from '../lib/contracts.js';
import {
  validAgentModel,
  validAgentReasoning,
} from '../domain/value-objects/agent-runtime-profile/agent-runtime-profile.schema.js';

export interface RunWorkflowCommand {
  readonly workflowRef: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly input: unknown;
  readonly hostId: string;
  readonly workspace: {
    readonly repositoryId: string;
    readonly baseRevision: string;
    readonly assignmentId: string;
  };
  readonly runtimeProfile: {
    readonly model: string;
    readonly reasoningEffort: string;
    readonly sandbox: 'readOnly' | 'workspaceWrite';
    readonly approvalPolicy: 'never';
  };
  readonly idempotencyKey: string;
  readonly display?: { readonly id: string; readonly title?: string };
}

export interface PreparedWorkflowRun {
  readonly runId: `workflow_${string}`;
  readonly streamId: `workflow:${string}`;
  readonly requestFingerprint: `sha256:${string}`;
  readonly command: RunWorkflowCommand;
}

export class RunWorkflowCommandError extends Error {
  override readonly name = 'RunWorkflowCommandError';

  constructor(
    readonly code: 'WORKFLOW_COMMAND_INVALID' | 'WORKFLOW_INPUT_INVALID',
    message: string,
  ) {
    super(message);
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function serializable(value: unknown): JsonValue {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('undefined');
    return JSON.parse(encoded) as JsonValue;
  } catch {
    throw new RunWorkflowCommandError(
      'WORKFLOW_INPUT_INVALID',
      'Workflow input must be JSON serializable.',
    );
  }
}

export function prepareWorkflowRun(value: unknown): PreparedWorkflowRun {
  if (
    !record(value) ||
    !exact(value, [
      'workflowRef',
      'sourceDigest',
      'input',
      'hostId',
      'workspace',
      'runtimeProfile',
      'idempotencyKey',
      ...('display' in value ? ['display'] : []),
    ]) ||
    !record(value.workspace) ||
    !record(value.runtimeProfile)
  ) {
    throw new RunWorkflowCommandError(
      'WORKFLOW_COMMAND_INVALID',
      'Invalid run_workflow command.',
    );
  }
  const command = value as unknown as RunWorkflowCommand;
  if (
    command.display !== undefined &&
    (!record(command.display) ||
      !ID.test(command.display.id) ||
      Object.keys(command.display).some(
        (key) => !['id', 'title'].includes(key),
      ) ||
      (command.display.title !== undefined &&
        (typeof command.display.title !== 'string' ||
          !command.display.title.trim() ||
          new TextEncoder().encode(command.display.title).length > 512)))
  ) {
    throw new RunWorkflowCommandError(
      'WORKFLOW_COMMAND_INVALID',
      'Invalid display metadata.',
    );
  }
  if (
    !ID.test(command.workflowRef) ||
    !DIGEST.test(command.sourceDigest) ||
    !ID.test(command.hostId) ||
    !ID.test(command.idempotencyKey) ||
    !exact(command.workspace, [
      'repositoryId',
      'baseRevision',
      'assignmentId',
    ]) ||
    !ID.test(command.workspace.repositoryId) ||
    !REVISION.test(command.workspace.baseRevision) ||
    !ID.test(command.workspace.assignmentId) ||
    !exact(command.runtimeProfile, [
      'model',
      'reasoningEffort',
      'sandbox',
      'approvalPolicy',
    ]) ||
    !validAgentModel(command.runtimeProfile.model) ||
    !validAgentReasoning(command.runtimeProfile.reasoningEffort) ||
    !['readOnly', 'workspaceWrite'].includes(command.runtimeProfile.sandbox) ||
    command.runtimeProfile.approvalPolicy !== 'never'
  ) {
    throw new RunWorkflowCommandError(
      'WORKFLOW_COMMAND_INVALID',
      'Invalid run_workflow command.',
    );
  }
  const frozen = deepFreeze({ ...command, input: serializable(command.input) });
  const requestFingerprint = sha256(canonicalizeJson(frozen));
  const runKey = sha256(command.idempotencyKey).slice('sha256:'.length);
  return deepFreeze({
    runId: `workflow_${runKey}`,
    streamId: `workflow:${runKey}`,
    requestFingerprint,
    command: frozen,
  });
}
