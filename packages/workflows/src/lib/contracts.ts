export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonSchema = Record<string, unknown>;

export interface WorkflowPolicy {
  maxConcurrentSteps: number;
  maxAttempts: number;
  sandbox: 'read-only' | 'workspace-write';
  approval: 'never' | 'on-request';
  network: 'disabled' | 'enabled';
  allowedRoots: string[];
  allowedModels: string[];
}

export interface WorkflowCondition {
  pointer: string;
  operator: 'exists' | 'equals' | 'not-equals';
  value?: JsonValue;
}

export type WorkflowHandler =
  | { type: 'registered'; name: string }
  | { type: 'codex'; prompt: string; model?: string };

interface WorkflowStepBase {
  id: string;
  dependsOn?: string[];
  condition?: WorkflowCondition;
}

export interface TaskStep extends WorkflowStepBase {
  kind: 'task';
  handler: WorkflowHandler;
  outputSchema?: JsonSchema;
}

export interface FanOutStep extends WorkflowStepBase {
  kind: 'fan-out';
  from: string;
  itemKey: string;
  maxItems: number;
  concurrency: number;
  handler: WorkflowHandler;
}

export interface JoinStep extends WorkflowStepBase {
  kind: 'join';
  mode: 'all' | 'any';
  dependsOn: string[];
}

export interface SubworkflowStep extends WorkflowStepBase {
  kind: 'subworkflow';
  workflow: WorkflowSource;
}

export interface ArtifactStep extends WorkflowStepBase {
  kind: 'artifact';
  sourceStep: string;
  mediaType: string;
  redaction: 'public' | 'internal' | 'sensitive';
  retention: 'ephemeral' | 'campaign' | 'permanent';
}

export type WorkflowStep =
  | TaskStep
  | FanOutStep
  | JoinStep
  | SubworkflowStep
  | ArtifactStep;

export interface WorkflowSource {
  schemaVersion: 1;
  id: string;
  version: number;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  policy: WorkflowPolicy;
  steps: WorkflowStep[];
}

export interface WorkflowIssue {
  code: string;
  path: string;
  message: string;
}

export class WorkflowValidationError extends Error {
  readonly code = 'WORKFLOW_INVALID';

  constructor(readonly issues: WorkflowIssue[]) {
    super(issues.map((issue) => `${issue.code} ${issue.path}`).join('; '));
    this.name = 'WorkflowValidationError';
  }
}

export interface NormalizedWorkflow {
  definition: WorkflowSource;
  canonicalJson: string;
  digest: `sha256:${string}`;
  dependencyEdges: number;
  requiredCapabilities: string[];
  childDigests: Record<string, `sha256:${string}`>;
}

export interface PlannedNode {
  id: string;
  stepId: string;
  kind: WorkflowStep['kind'];
  dependsOn: string[];
  status: 'ready' | 'skipped';
  capabilityRequest: string[];
  policyRequest: WorkflowPolicy;
  handlerRequest?:
    | { type: 'registered'; name: string }
    | {
        type: 'codex';
        model: string;
        promptDigest: `sha256:${string}`;
      };
  itemKey?: string;
  childDigest?: `sha256:${string}`;
  artifact?: {
    sourceStep: string;
    mediaType: string;
    redaction: ArtifactStep['redaction'];
    retention: ArtifactStep['retention'];
  };
}

export interface WorkflowPlan {
  schemaVersion: 1;
  workflowId: string;
  workflowVersion: number;
  definitionDigest: `sha256:${string}`;
  inputDigest: `sha256:${string}`;
  policy: WorkflowPolicy;
  nodes: PlannedNode[];
  warnings: string[];
  requiredCapabilities: string[];
}

export interface LegacyPiTask {
  id: string;
  parentId?: string;
  status?: string;
  title?: string;
}

export interface LegacyPiImport {
  schemaVersion: 1;
  sourceType: 'goal-v3' | 'goal-events-jsonl';
  sourceDigest: `sha256:${string}`;
  legacyVersion?: 3;
  goalIds: string[];
  eventIds: string[];
  timestamps: string[];
  objective?: string;
  tasks: LegacyPiTask[];
  policyRequest: { autoContinue?: boolean; blockCompletion?: boolean };
  historicalClaims: Array<{ kind: string; text: string }>;
  truncatedClaims: number;
}
