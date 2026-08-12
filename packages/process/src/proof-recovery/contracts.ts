export type ProcessActorRole =
  | 'coordinator'
  | 'worker'
  | 'preflight'
  | 'judge'
  | 'reader';

export type ProcessEventKind =
  | 'candidate.registered'
  | 'artifact.registered'
  | 'preflight.submitted'
  | 'verdict.submitted';

export interface ProcessEvent {
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly kind: ProcessEventKind;
  readonly actorRole: ProcessActorRole;
  readonly candidateDigest: `sha256:${string}`;
  readonly payloadDigest: `sha256:${string}`;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CandidateProjection {
  readonly candidateDigest?: `sha256:${string}`;
  readonly state:
    | 'unregistered'
    | 'registered'
    | 'preflight_invalid'
    | 'judgment_ready'
    | 'audit_approved'
    | 'audit_blocked'
    | 'audit_escalated';
  readonly artifactKinds: readonly string[];
  readonly replayDigest: `sha256:${string}`;
}

export class ProcessControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProcessControlError';
  }
}
