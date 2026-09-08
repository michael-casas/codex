import {
  APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES,
  APP_SERVER_MAX_MESSAGE_BYTES,
} from '@codex/codex';

export function bridgeMessageLimit(
  argument: string | undefined,
  invalid: string,
): number {
  const value =
    argument === undefined
      ? APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES
      : /^--max-message-bytes=\d+$/.test(argument)
        ? Number(argument.slice('--max-message-bytes='.length))
        : NaN;
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > APP_SERVER_MAX_MESSAGE_BYTES
  ) {
    process.stderr.write(`${invalid}\n`);
    process.exit(1);
  }
  return value;
}

export function assertBridgeMessageSize(
  observedBytes: number,
  limitBytes: number,
): void {
  if (observedBytes <= limitBytes) return;
  process.stderr.write(
    `CODEX_BRIDGE_DIAGNOSTIC:${JSON.stringify({
      code: 'MESSAGE_TOO_LARGE',
      observedBytes,
      limitBytes,
      retryable: false,
    })}\n`,
  );
  process.exit(1);
}
