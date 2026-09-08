export type VisibilityStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'offline'
  | 'unknown';

export interface VisibilityAgent {
  readonly id: string;
  readonly label: string;
  readonly status: VisibilityStatus;
  readonly stateText: string;
  readonly errorText?: string;
}

export interface VisibilityStep {
  readonly id: string;
  readonly label: string;
  readonly progressLabel?: string;
  readonly agents: readonly VisibilityAgent[];
}

export interface VisibilityWorkflow {
  readonly id: string;
  readonly label: string;
  readonly status: VisibilityStatus;
  readonly stateText: string;
  readonly errorText?: string;
  readonly progressLabel?: string;
  readonly steps: readonly VisibilityStep[];
}

export interface VisibilityEvent {
  readonly eventId: string;
  readonly kind?: string;
  readonly occurredAt: string;
  readonly detail?: {
    readonly type: 'message' | 'command' | 'tool';
    readonly body: string;
    readonly truncated: boolean;
  };
}

export interface VisibilityItem {
  readonly id: string;
  readonly agentId: string;
  readonly workflowId?: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly kind: 'message' | 'tool' | 'command' | 'result';
  readonly state:
    | 'streaming'
    | 'completed'
    | 'failed'
    | 'interrupted'
    | 'unknown';
  readonly body: string;
  readonly fields?: readonly {
    readonly name: string;
    readonly value: string | number | boolean | null;
  }[];
  readonly schemaDigest?: string;
  readonly messagePhase?: 'commentary' | 'final_answer' | null;
  readonly firstSeenAt: string;
  readonly updatedAt: string;
  readonly revision: string;
  readonly truncated: boolean;
  readonly originalBytes?: number;
  readonly evaluation: boolean;
}

export interface VisibilityResult {
  readonly cursor: string;
  readonly changed: boolean;
  readonly workflows?: readonly VisibilityWorkflow[];
  readonly summariesTruncated?: boolean;
  readonly cancelledWorkflowIds?: readonly string[];
  readonly cancelledAgentIds?: readonly string[];
  readonly evaluationLimits?: {
    readonly itemBytes: number;
    readonly logicalItems: number;
    readonly aggregateBytes: number;
    readonly permanent: boolean;
  };
  readonly details?: {
    readonly agentId: string;
    readonly truncated: boolean;
    readonly events: readonly VisibilityEvent[];
    readonly items?: readonly VisibilityItem[];
  };
  readonly decisions?: readonly {
    readonly id: string;
    readonly label: string;
    readonly state: string;
  }[];
  readonly artifacts?: readonly {
    readonly id: string;
    readonly label: string;
    readonly href?: string;
  }[];
}

export type ControlToolName = 'get_control_snapshot' | 'wait_control_delta';

export interface ControlClient {
  callTool(
    name: ControlToolName,
    args: Record<string, unknown>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<VisibilityResult>;
}

export type ControlPhase =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'offline'
  | 'reconnecting';
