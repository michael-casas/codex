/** Closed diagnostic vocabulary: never retain exception messages or arbitrary names. */
export function classifyObservationError(error: unknown) {
  const value = error && typeof error === 'object' ? error : {};
  const rawCode = 'code' in value ? value.code : undefined;
  const connections = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    '08000',
    '08001',
    '08003',
    '08006',
    '57P01',
    '57P02',
    '57P03',
    'VISIBILITY_SOURCE_DISCONNECTED',
  ];
  const visibility = ['VISIBILITY_EVENT_CONFLICT', 'VISIBILITY_EVENT_INVALID'];
  const causeCode =
    typeof rawCode === 'string' &&
    (connections.includes(rawCode) ||
      visibility.includes(rawCode) ||
      /^(?:[0-9]{2}|F0|HV|P0|XX)[0-9A-Z]{3}$/.test(rawCode))
      ? rawCode
      : 'UNKNOWN';
  const name = error instanceof Error ? error.constructor.name : '';
  const errorClass = [
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'DatabaseError',
    'RuntimeVisibilityError',
  ].includes(name)
    ? name
    : 'UnknownError';
  const retryable =
    connections.includes(causeCode) ||
    ['53300', '53200', '53400', '40001', '40P01', '55P03'].includes(causeCode);
  return {
    code: retryable
      ? 'VISIBILITY_SOURCE_UNAVAILABLE'
      : visibility.includes(causeCode)
        ? causeCode
        : 'VISIBILITY_OBSERVER_FAILED',
    causeCode,
    errorClass,
    retryable,
  };
}
