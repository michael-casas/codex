import type { CodexTurnResult } from './types.js';

const attestedTurns = new WeakSet<object>();

export function attestCodexTurnResult(result: CodexTurnResult): CodexTurnResult {
  attestedTurns.add(result);
  return result;
}

export function isAttestedCodexTurnResult(value: unknown): value is CodexTurnResult {
  return typeof value === 'object' && value !== null && attestedTurns.has(value);
}
