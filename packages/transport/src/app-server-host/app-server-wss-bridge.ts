import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  assertBridgeMessageSize,
  bridgeMessageLimit,
} from './app-server-bridge-budget.js';

const TOKEN_ENV = 'CAS02_REMOTE_TOKEN';
const MAX_MESSAGE_BYTES = bridgeMessageLimit(
  process.argv[5],
  'APP_SERVER_WSS_BRIDGE_INVALID',
);
const TIMEOUT_MS = 10_000;

interface BunWebSocketOptions {
  headers: Record<string, string>;
  tls?: { ca: Buffer };
}

type BunWebSocketConstructor = new (
  url: string,
  options: BunWebSocketOptions,
) => WebSocket;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function argumentsOrFail(): {
  endpoint: string;
  caCertificatePath?: string;
  mode: '--version' | 'connect';
  token: string;
} {
  const [, , endpoint, caPath, mode] = process.argv;
  const token = process.env[TOKEN_ENV];
  if (
    !endpoint ||
    !mode ||
    (mode !== '--version' && mode !== 'connect') ||
    !token ||
    /[\r\n]/.test(token)
  ) {
    fail('APP_SERVER_WSS_BRIDGE_INVALID');
  }
  return {
    endpoint,
    ...(caPath && caPath !== '-' ? { caCertificatePath: caPath } : {}),
    mode,
    token,
  };
}

function socket(options: ReturnType<typeof argumentsOrFail>): WebSocket {
  const Constructor = WebSocket as unknown as BunWebSocketConstructor;
  return new Constructor(options.endpoint, {
    headers: { Authorization: `Bearer ${options.token}` },
    ...(options.caCertificatePath
      ? { tls: { ca: readFileSync(options.caCertificatePath) } }
      : {}),
  });
}

function messageText(event: MessageEvent): string {
  if (typeof event.data !== 'string') fail('APP_SERVER_WSS_BRIDGE_BINARY');
  assertBridgeMessageSize(Buffer.byteLength(event.data), MAX_MESSAGE_BYTES);
  return event.data;
}

async function version(options: ReturnType<typeof argumentsOrFail>) {
  const ws = socket(options);
  const timeout = setTimeout(
    () => fail('APP_SERVER_WSS_BRIDGE_TIMEOUT'),
    TIMEOUT_MS,
  );
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          method: 'initialize',
          id: 0,
          params: {
            clientInfo: {
              name: 'codex_control_probe',
              title: 'Codex Control Probe',
              version: '0.151.0',
            },
            capabilities: null,
          },
        }),
      );
    });
    ws.addEventListener('message', (event) => {
      let response: unknown;
      try {
        response = JSON.parse(messageText(event));
      } catch {
        reject(new Error('MALFORMED'));
        return;
      }
      if (
        typeof response !== 'object' ||
        response === null ||
        !('id' in response) ||
        response.id !== 0 ||
        !('result' in response) ||
        typeof response.result !== 'object' ||
        response.result === null ||
        !('userAgent' in response.result) ||
        typeof response.result.userAgent !== 'string'
      ) {
        return;
      }
      const version = response.result.userAgent.match(/\b\d+\.\d+\.\d+\b/)?.[0];
      if (!version) {
        reject(new Error('VERSION'));
        return;
      }
      ws.send(JSON.stringify({ method: 'initialized' }));
      process.stdout.write(`codex-cli ${version}\n`);
      ws.close(1000, 'probe-complete');
      resolve();
    });
    ws.addEventListener('error', () => reject(new Error('CONNECTION')));
    ws.addEventListener('close', (event) => {
      if (event.code !== 1000) reject(new Error('CLOSED'));
    });
  }).catch(() => fail('APP_SERVER_WSS_BRIDGE_PROBE_FAILED'));
  clearTimeout(timeout);
}

async function connect(options: ReturnType<typeof argumentsOrFail>) {
  const ws = socket(options);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pendingLines: string[] = [];
  let opened = false;
  let finished = false;
  const timeout = setTimeout(() => {
    if (!opened) fail('APP_SERVER_WSS_BRIDGE_TIMEOUT');
  }, TIMEOUT_MS);

  ws.addEventListener('open', () => {
    opened = true;
    clearTimeout(timeout);
    for (const line of pendingLines.splice(0)) ws.send(line);
  });
  ws.addEventListener('message', (event) => {
    process.stdout.write(`${messageText(event)}\n`);
  });
  ws.addEventListener('error', () => {
    if (!finished) fail('APP_SERVER_WSS_BRIDGE_CONNECTION_FAILED');
  });
  ws.addEventListener('close', () => {
    finished = true;
    lines.close();
  });
  lines.on('line', (line) => {
    assertBridgeMessageSize(Buffer.byteLength(line), MAX_MESSAGE_BYTES);
    if (!opened) {
      if (pendingLines.length >= 256)
        fail('APP_SERVER_WSS_BRIDGE_BACKPRESSURE');
      pendingLines.push(line);
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      fail('APP_SERVER_WSS_BRIDGE_NOT_READY');
    }
    ws.send(line);
  });
  lines.once('close', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'stdin-closed');
  });
  await new Promise<void>((resolve) =>
    ws.addEventListener('close', () => resolve(), { once: true }),
  );
}

const options = argumentsOrFail();
if (options.mode === '--version') await version(options);
else await connect(options);
