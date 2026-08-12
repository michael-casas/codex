import { createHash } from 'node:crypto';

import type { CandidateProjection, ProcessEvent } from './contracts.js';
import { ProcessControlError } from './contracts.js';
import { maySubmitProcessEvent } from './policy.js';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(',')}}`;
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

function validPreflightPayload(
  payload: Readonly<Record<string, unknown>>,
  candidateDigest: string,
  artifactKinds: ReadonlySet<string>,
): boolean {
  const required = stringArray(payload.requiredArtifactKinds);
  return (
    payload.status === 'valid' &&
    payload.candidateDigest === candidateDigest &&
    Number.isInteger(payload.gateCount) &&
    Number(payload.gateCount) > 0 &&
    Number.isInteger(payload.nativeTests) &&
    Number(payload.nativeTests) > 0 &&
    payload.allGatesPassed === true &&
    payload.unexpectedResourceDelta === 0 &&
    required.length > 0 &&
    required.every((kind) => artifactKinds.has(kind))
  );
}

export function reduceCandidateEvents(
  events: readonly ProcessEvent[],
): CandidateProjection {
  const accepted = new Map<string, ProcessEvent>();
  let lastSequence = 0;
  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) {
      throw new ProcessControlError(
        'PROCESS_EVENT_ORDER_INVALID',
        'Process events must have a strictly increasing sequence.',
      );
    }
    lastSequence = event.sequence;
    if (!maySubmitProcessEvent(event.actorRole, event.kind)) {
      throw new ProcessControlError(
        'PROCESS_ROLE_UNAUTHORIZED',
        'The actor role cannot submit this process event.',
      );
    }
    if (digest(event.payload) !== event.payloadDigest) {
      throw new ProcessControlError(
        'PROCESS_EVENT_DIGEST_INVALID',
        'The event payload digest does not match its canonical payload.',
      );
    }
    const prior = accepted.get(event.idempotencyKey);
    if (prior) {
      if (
        prior.kind !== event.kind ||
        prior.actorRole !== event.actorRole ||
        prior.candidateDigest !== event.candidateDigest ||
        prior.payloadDigest !== event.payloadDigest
      ) {
        throw new ProcessControlError(
          'PROCESS_IDEMPOTENCY_CONFLICT',
          'A conflicting event reused an existing idempotency key.',
        );
      }
      continue;
    }
    accepted.set(event.idempotencyKey, event);
  }

  let candidateDigest: `sha256:${string}` | undefined;
  let state: CandidateProjection['state'] = 'unregistered';
  const artifactKinds = new Set<string>();
  for (const event of accepted.values()) {
    if (candidateDigest && event.candidateDigest !== candidateDigest) {
      throw new ProcessControlError(
        'PROCESS_CANDIDATE_CONFLICT',
        'One replay stream cannot mix candidate digests.',
      );
    }
    if (event.kind === 'candidate.registered') {
      candidateDigest = event.candidateDigest;
      state = 'registered';
      continue;
    }
    if (!candidateDigest) {
      throw new ProcessControlError(
        'PROCESS_CANDIDATE_UNREGISTERED',
        'Candidate registration must precede dependent events.',
      );
    }
    if (event.kind === 'artifact.registered') {
      if (typeof event.payload.kind !== 'string' || !event.payload.kind) {
        throw new ProcessControlError(
          'PROCESS_ARTIFACT_INVALID',
          'Artifact events require a stable kind.',
        );
      }
      artifactKinds.add(event.payload.kind);
      continue;
    }
    if (event.kind === 'preflight.submitted') {
      state = validPreflightPayload(
        event.payload,
        candidateDigest,
        artifactKinds,
      )
        ? 'judgment_ready'
        : 'preflight_invalid';
      continue;
    }
    if (event.kind === 'verdict.submitted') {
      if (state !== 'judgment_ready') {
        throw new ProcessControlError(
          'PROCESS_JUDGMENT_NOT_READY',
          'A verdict cannot reduce before valid Preflight.',
        );
      }
      const verdict = event.payload.verdict;
      if (verdict === 'APPROVED') {
        state =
          Number(event.payload.score) >= 4 && event.payload.blockingViolations === 0
            ? 'audit_approved'
            : 'audit_blocked';
      } else if (verdict === 'BLOCKED') {
        state = 'audit_blocked';
      } else if (verdict === 'ESCALATED') {
        state = 'audit_escalated';
      } else {
        throw new ProcessControlError(
          'PROCESS_VERDICT_INVALID',
          'The submitted audit verdict is not canonical.',
        );
      }
    }
  }

  const artifactKindsOrdered = [...artifactKinds].sort();
  const projectionBody = {
    ...(candidateDigest ? { candidateDigest } : {}),
    state,
    artifactKinds: artifactKindsOrdered,
  };
  return {
    ...projectionBody,
    replayDigest: digest(projectionBody),
  };
}
