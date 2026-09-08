import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';

function serverFrame(payload: Buffer, opcode = 1, final = true): Buffer {
  const extended = payload.length < 126 ? 0 : payload.length <= 65535 ? 2 : 8;
  const header = Buffer.alloc(2 + extended);
  header[0] = (final ? 0x80 : 0) | opcode;
  header[1] = extended === 0 ? payload.length : extended === 2 ? 126 : 127;
  if (extended === 2) header.writeUInt16BE(payload.length, 2);
  if (extended === 8) header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

export async function runUnixBridgeFixture(options: {
  payloadBytes: number;
  limit?: string;
  fragmented?: boolean;
  wss?: boolean;
}) {
  const root = await mkdtemp('/tmp/host-r1-');
  const socketPath = join(root, 's');
  const sockets = new Set<Duplex>();
  let connections = 0;
  const payload = Buffer.from(
    JSON.stringify({
      method: 'item/completed',
      params: { result: 'x'.repeat(options.payloadBytes) },
    }),
  );
  const certPath = join(root, 'cert.pem');
  const keyPath = join(root, 'key.pem');
  if (options.wss)
    await promisify(execFile)(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost',
      ],
      { env: { PATH: process.env.PATH } },
    );
  const server = options.wss
    ? createHttpsServer({
        key: await readFile(keyPath),
        cert: await readFile(certPath),
      })
    : createServer();
  server.on('upgrade', (request, socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => sockets.delete(socket));
    const accept = createHash('sha1')
      .update(
        `${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
      )
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const frames = options.fragmented
      ? [
          serverFrame(
            payload.subarray(0, Math.ceil(payload.length / 2)),
            1,
            false,
          ),
          serverFrame(payload.subarray(Math.ceil(payload.length / 2)), 0, true),
        ]
      : [serverFrame(payload)];
    socket.end(Buffer.concat([...frames, serverFrame(Buffer.alloc(0), 8)]));
  });
  if (options.wss) server.listen(0, '127.0.0.1');
  else server.listen(socketPath);
  await once(server, 'listening');
  const address = server.address();
  const args =
    options.wss && address && typeof address !== 'string'
      ? [
          fileURLToPath(
            new URL('../app-server-wss-bridge.ts', import.meta.url),
          ),
          `wss://localhost:${address.port}`,
          certPath,
          'connect',
        ]
      : [
          fileURLToPath(
            new URL('../app-server-unix-bridge.ts', import.meta.url),
          ),
          socketPath,
          'connect',
        ];
  const child = spawn(
    'bun',
    [
      ...args,
      ...(options.limit === undefined
        ? []
        : [`--max-message-bytes=${options.limit}`]),
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, CAS02_REMOTE_TOKEN: 'synthetic-only' },
    },
  );
  let outputBytes = 0;
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    outputBytes += chunk.length;
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(0, 4096);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exit = once(child, 'exit').then(([code]) => ({
    exitedNaturally: true,
    code: code as number | null,
  }));
  try {
    const outcome = await Promise.race([
      exit,
      new Promise<{ exitedNaturally: boolean; code: null }>((resolve) => {
        timer = setTimeout(
          () => resolve({ exitedNaturally: false, code: null }),
          1500,
        );
      }),
    ]);
    return {
      ...outcome,
      outputBytes,
      expectedOutputBytes: payload.length + 1,
      stderr,
      connections,
      payloadBytes: payload.length,
    };
  } finally {
    if (timer) clearTimeout(timer);
    child.stdin.end();
    for (const socket of sockets) socket.destroy();
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await exit;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
}
