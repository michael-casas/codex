import type { JsonSchema, JsonValue } from '../lib/contracts.js';

export type WorkflowModel = string;
export type WorkflowReasoning = string;

export interface AgentCommandEvidenceRule {
  readonly id: string;
  readonly includes: string;
  readonly expectedCount: number;
}

export interface AgentCommandEvidencePolicy {
  readonly rules: readonly AgentCommandEvidenceRule[];
}

export interface AgentCommandRuleEvidence {
  readonly id: string;
  readonly expectedCount: number;
  readonly observedCount: number;
  readonly passed: boolean;
}

export interface AgentCommandEvidence {
  readonly schemaVersion: 1;
  readonly policyDigest: `sha256:${string}`;
  readonly totalCompletedCommands: number;
  readonly commandDigests: readonly `sha256:${string}`[];
  readonly rules: readonly AgentCommandRuleEvidence[];
  readonly digest: `sha256:${string}`;
}

export interface WorkflowDefinitionOptions<Input, Output> {
  id: string;
  version?: number;
  description?: string;
  title?: string;
  maxConcurrency?: number;
  inputSchema?: JsonSchema;
  run(input: Input): Promise<Output> | Output;
}

export interface WorkflowDefinition<Input = unknown, Output = unknown> {
  readonly id: string;
  readonly version: number;
  readonly description?: string;
  readonly title?: string;
  readonly maxConcurrency: number;
  readonly inputSchema?: JsonSchema;
  readonly run: (input: Input) => Promise<Output> | Output;
}

export interface AgentOptions<Input = unknown> {
  label: string;
  model: WorkflowModel;
  reasoning: WorkflowReasoning;
  prompt: string;
  input?: Input;
  outputSchema?: JsonSchema;
  commandEvidence?: AgentCommandEvidencePolicy;
}

export interface WorkflowArtifact {
  readonly name: string;
  readonly path: string;
  readonly publishedPath?: string;
  readonly digest: `sha256:${string}`;
  readonly mediaType: string;
}

export interface ArtifactOptions<Value = unknown> {
  value: Value;
  mediaType?: string;
  publishPath?: string;
}

export interface WorkflowAgentExecutionRequest<Input = unknown>
  extends AgentOptions<Input> {
  readonly signal: AbortSignal;
  readonly node: FrozenWorkflowNode;
  readonly onRuntimeEvent: (
    event: WorkflowRuntimeEvent,
  ) => void | Promise<void>;
}

export interface WorkflowRuntimeEvent {
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

export interface WorkflowAgentExecutionResult {
  readonly threadId: string;
  readonly finalResponse: string;
  readonly usage: JsonValue | null;
  readonly commandEvidence?: AgentCommandEvidence;
  readonly runtimeTurn?: unknown;
}

export interface FrozenWorkflowNode {
  readonly id: string;
  readonly ordinal: number;
  readonly label: string;
  readonly phase?: string;
  readonly dependencies: readonly string[];
  readonly model: WorkflowModel;
  readonly reasoning: WorkflowReasoning;
  readonly promptDigest: `sha256:${string}`;
  readonly inputDigest: `sha256:${string}`;
  readonly outputSchemaDigest?: `sha256:${string}`;
  readonly commandEvidencePolicyDigest?: `sha256:${string}`;
  readonly frozenAt: string;
}

export type WorkflowNodeOutcome = 'completed' | 'failed' | 'cancelled';

export interface WorkflowNodeResult extends FrozenWorkflowNode {
  readonly startedAt?: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly outcome: WorkflowNodeOutcome;
  readonly outputDigest?: `sha256:${string}`;
  readonly commandEvidence?: AgentCommandEvidence;
  readonly diagnostic?:
    | 'agent-failed'
    | 'artifact-failed'
    | 'cancelled'
    | 'output-schema-failed';
}

export type WorkflowPublicEvent = Readonly<{
  sequence: number;
  type:
    | 'workflow.started'
    | 'workflow.completed'
    | 'workflow.failed'
    | 'workflow.cancelled'
    | 'phase.started'
    | 'phase.completed'
    | 'phase.failed'
    | 'node.frozen'
    | 'node.started'
    | 'node.completed'
    | 'node.failed'
    | 'node.cancelled'
    | 'artifact.created';
  at: string;
  runId: string;
  phase?: string;
  node?: FrozenWorkflowNode;
  nodeId?: string;
  outcome?: WorkflowNodeOutcome;
  durationMs?: number;
  outputDigest?: `sha256:${string}`;
  commandEvidence?: AgentCommandEvidence;
  diagnostic?: WorkflowNodeResult['diagnostic'];
  artifact?: WorkflowArtifact;
}>;

export interface ExecuteWorkflowOptions {
  runId: string;
  signal?: AbortSignal;
  executeAgent(
    request: WorkflowAgentExecutionRequest,
  ): Promise<WorkflowAgentExecutionResult>;
  writeArtifact(request: {
    name: string;
    value: unknown;
    mediaType?: string;
    publishPath?: string;
  }): Promise<WorkflowArtifact>;
  onEvent(event: WorkflowPublicEvent): void | Promise<void>;
  onRuntimeEvent?(event: WorkflowRuntimeEvent): void | Promise<void>;
  onAgentOutput?(result: {
    readonly node: FrozenWorkflowNode;
    readonly output: unknown;
  }): void | Promise<void>;
  now?: () => Date;
}

export interface WorkflowExecutionResult<Output> {
  readonly status: 'completed';
  readonly output: Output;
  readonly nodes: readonly WorkflowNodeResult[];
  readonly artifacts: readonly WorkflowArtifact[];
}

export type WorkflowExecutionErrorCode =
  | 'WORKFLOW_DEFINITION_INVALID'
  | 'WORKFLOW_INPUT_INVALID'
  | 'WORKFLOW_AGENT_FAILED'
  | 'WORKFLOW_ARTIFACT_FAILED'
  | 'WORKFLOW_OUTPUT_SCHEMA_FAILED'
  | 'WORKFLOW_CANCELLED'
  | 'WORKFLOW_RUNTIME_UNAVAILABLE';

export class WorkflowExecutionError extends Error {
  constructor(
    readonly code: WorkflowExecutionErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}

export interface WorkflowRuntimeBridge {
  phase<Value>(
    name: string,
    callback: () => Promise<Value> | Value,
  ): Promise<Value>;
  agent<Output, Input>(options: AgentOptions<Input>): Promise<Output>;
  artifact(name: string, valueOrOptions: unknown): Promise<WorkflowArtifact>;
}
