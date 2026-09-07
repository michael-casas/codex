// Provider support is decided by App Server, not a stale local model matrix.
export function validAgentModel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$/.test(value)
  );
}

export function validAgentReasoning(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}
