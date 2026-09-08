import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const scenario = process.env.CAS01_SCENARIO ?? 'default';
const tracePath = process.env.CAS01_TRACE_PATH;

function trace(value) {
  if (tracePath) appendFileSync(tracePath, `${JSON.stringify(value)}\n`);
}

if (process.argv.includes('--version')) {
  trace({ type: 'version' });
  process.stdout.write(`codex-cli ${process.env.CAS01_VERSION ?? '0.151.0'}\n`);
  process.exit(0);
}

trace({ type: 'server-start' });

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const pending = [];
const lines = createInterface({ input: process.stdin });

for await (const line of lines) {
  const message = JSON.parse(line);
  trace({ type: 'receive', message });

  if (message.method === 'initialize') {
    send({
      id: message.id,
      result: {
        userAgent: 'controlled',
        codexHome: '/',
        platformFamily: 'u',
        platformOs: 'l',
      },
    });
    continue;
  }

  if (message.method === 'initialized') {
    if (scenario === 'inbound') {
      send({ method: 'future/notification', params: { value: 1 } });
      send({
        id: 'server-1',
        method: 'item/tool/requestUserInput',
        params: { prompt: 'controlled' },
      });
    }
    if (scenario === 'overflow') {
      send({ method: 'future/one', params: {} });
      send({ method: 'future/two', params: {} });
    }
    continue;
  }

  if ('result' in message || 'error' in message) {
    trace({ type: 'client-response', message });
    continue;
  }

  if (scenario === 'out-of-order') {
    pending.push(message);
    if (pending.length === 2) {
      const [first, second] = pending;
      send({ id: second.id, result: { method: second.method } });
      send({ id: first.id, result: { method: first.method } });
    }
    continue;
  }

  if (scenario === 'unmatched') {
    send({ id: 999_999, result: {} });
    continue;
  }

  if (scenario === 'provider-error') {
    send({
      id: message.id,
      error: {
        code: -32_042,
        message: 'provider secret CAS01_DO_NOT_LEAK',
        data: { token: 'CAS01_DO_NOT_LEAK' },
      },
    });
    continue;
  }

  if (scenario === 'malformed') {
    process.stdout.write('{not-json\n');
    continue;
  }

  if (scenario === 'oversized') {
    send({ method: 'future/large', params: { value: 'x'.repeat(2_048) } });
    continue;
  }

  if (scenario === 'delayed') {
    setTimeout(() => {
      send({ id: message.id, result: { method: message.method } });
    }, 40);
    continue;
  }

  if (scenario === 'eof') {
    process.exit(0);
  }

  if (scenario === 'hostr1-large' && message.method === 'large') {
    send({
      method: 'item/completed',
      params: { value: 'x'.repeat(2_250_000) },
    });
    send({ id: message.id, result: { value: 'x'.repeat(2_250_000) } });
    continue;
  }

  if (scenario.startsWith('hostr1-diagnostic')) {
    const diagnostic =
      'CODEX_BRIDGE_DIAGNOSTIC:' +
      JSON.stringify({
        code: 'MESSAGE_TOO_LARGE',
        observedBytes: 2_250_000,
        limitBytes: 1_048_576,
        retryable: false,
      }) +
      '\n';
    if (scenario === 'hostr1-diagnostic-eof-first') {
      process.stdout.end(() =>
        setTimeout(() => {
          process.stderr.write(diagnostic, () => process.exit(1));
        }, 10),
      );
    } else {
      process.stderr.write(diagnostic, () => process.exit(1));
    }
    break;
  }

  if (scenario === 'hostr1-invalid-stderr') {
    process.stderr.write('SECRET_DO_NOT_LEAK'.repeat(1000) + '\n');
    for (const value of [
      {
        code: 'MESSAGE_TOO_LARGE',
        observedBytes: 3,
        limitBytes: 2,
        retryable: false,
        secret: 'SECRET_DO_NOT_LEAK',
      },
      {
        code: 'MESSAGE_TOO_LARGE',
        observedBytes: 2,
        limitBytes: 3,
        retryable: false,
      },
      {
        code: 'MESSAGE_TOO_LARGE',
        observedBytes: 3,
        limitBytes: 2,
        retryable: true,
      },
      { code: 'UNKNOWN', observedBytes: 3, limitBytes: 2, retryable: false },
    ])
      process.stderr.write(
        'CODEX_BRIDGE_DIAGNOSTIC:' + JSON.stringify(value) + '\n',
      );
    send({ id: message.id, result: { method: message.method } });
    continue;
  }

  send({ id: message.id, result: { method: message.method } });
}
