import type { ProcessActorRole, ProcessEventKind } from './contracts.js';

export function maySubmitProcessEvent(
  role: ProcessActorRole,
  kind: ProcessEventKind,
): boolean {
  const allowed: Readonly<Record<ProcessActorRole, readonly ProcessEventKind[]>> = {
    coordinator: ['candidate.registered', 'artifact.registered'],
    worker: [],
    preflight: ['artifact.registered', 'preflight.submitted'],
    judge: ['artifact.registered', 'verdict.submitted'],
    reader: [],
  };
  return allowed[role].includes(kind);
}
