import { randomBytes, createHash } from 'node:crypto';
import { request } from 'node:http';
import type { Duplex } from 'node:stream';
import { createInterface } from 'node:readline';
import {
  assertBridgeMessageSize,
  bridgeMessageLimit,
} from './app-server-bridge-budget.js';

const MAX_MESSAGE_BYTES = bridgeMessageLimit(
  process.argv[4],
  'APP_SERVER_UNIX_BRIDGE_INVALID',
);
const TIMEOUT_MS = 10_000;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function options(): { socketPath: string; mode: '--version' | 'connect' } {
  const [, , socketPath, mode] = process.argv;
  if (!socketPath || (mode !== '--version' && mode !== 'connect')) {
    fail('APP_SERVER_UNIX_BRIDGE_INVALID');
  }
  return { socketPath, mode };
}

function frame(opcode: number, payload: Buffer): Buffer {
  assertBridgeMessageSize(payload.length, MAX_MESSAGE_BYTES);
  const extended = payload.length < 126 ? 0 : payload.length <= 65_535 ? 2 : 8;
  const header = Buffer.alloc(2 + extended + 4);
  header[0] = 0x80 | opcode;
  header[1] =
    0x80 | (extended === 0 ? payload.length : extended === 2 ? 126 : 127);
  if (extended === 2) header.writeUInt16BE(payload.length, 2);
  if (extended === 8) header.writeBigUInt64BE(BigInt(payload.length), 2);
  const maskOffset = 2 + extended;
  const mask = randomBytes(4);
  mask.copy(header, maskOffset);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  }
  return Buffer.concat([header, masked]);
}

class Frames {
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;

  constructor(
    private readonly socket: Duplex,
    private readonly onText: (text: string) => void,
  ) {
    socket.on('data', (chunk: Buffer) => this.read(chunk));
  }

  text(value: string): void {
    this.socket.write(frame(0x1, Buffer.from(value)));
  }

  close(): void {
    if (!this.socket.destroyed) this.socket.end(frame(0x8, Buffer.alloc(0)));
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.consume()) continue;
  }

  private consume(): boolean {
    if (this.buffer.length < 2) return false;
    const first = this.buffer[0] ?? 0;
    const second = this.buffer[1] ?? 0;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (this.buffer.length < 4) return false;
      length = this.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (this.buffer.length < 10) return false;
      const value = this.buffer.readBigUInt64BE(2);
      assertBridgeMessageSize(
        Number(
          value > BigInt(Number.MAX_SAFE_INTEGER)
            ? BigInt(Number.MAX_SAFE_INTEGER)
            : value,
        ),
        MAX_MESSAGE_BYTES,
      );
      length = Number(value);
      offset = 10;
    }
    assertBridgeMessageSize(length, MAX_MESSAGE_BYTES);
    const maskBytes = masked ? 4 : 0;
    if (this.buffer.length < offset + maskBytes + length) return false;
    const mask = masked ? this.buffer.subarray(offset, offset + 4) : undefined;
    offset += maskBytes;
    const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
    this.buffer = this.buffer.subarray(offset + length);
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
      }
    }
    this.handle(first & 0x0f, (first & 0x80) !== 0, payload);
    return true;
  }

  private handle(opcode: number, final: boolean, payload: Buffer): void {
    if (opcode === 0x8) {
      this.socket.end(frame(0x8, Buffer.alloc(0)));
      return;
    }
    if (opcode === 0x9) {
      this.socket.write(frame(0xa, payload));
      return;
    }
    if (opcode === 0xa) return;
    if (opcode !== 0x0 && opcode !== 0x1) {
      fail('APP_SERVER_UNIX_BRIDGE_FRAME');
    }
    this.fragments.push(payload);
    this.fragmentBytes += payload.length;
    assertBridgeMessageSize(this.fragmentBytes, MAX_MESSAGE_BYTES);
    if (!final) return;
    const text = Buffer.concat(this.fragments, this.fragmentBytes).toString(
      'utf8',
    );
    this.fragments = [];
    this.fragmentBytes = 0;
    this.onText(text);
  }
}

async function websocket(socketPath: string, onText: (text: string) => void) {
  const key = randomBytes(16).toString('base64');
  return await new Promise<{ frames: Frames; socket: Duplex }>(
    (resolve, reject) => {
      const upgrade = request({
        socketPath,
        path: '/',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
      });
      const timeout = setTimeout(
        () => reject(new Error('TIMEOUT')),
        TIMEOUT_MS,
      );
      upgrade.once('upgrade', (response, socket, head) => {
        clearTimeout(timeout);
        const expected = createHash('sha1')
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest('base64');
        if (response.headers['sec-websocket-accept'] !== expected) {
          socket.destroy();
          reject(new Error('HANDSHAKE'));
          return;
        }
        const frames = new Frames(socket, onText);
        if (head.length > 0) socket.unshift(head);
        resolve({ frames, socket });
      });
      upgrade.once('response', () => reject(new Error('UPGRADE')));
      upgrade.once('error', reject);
      upgrade.end();
    },
  ).catch(() => fail('APP_SERVER_UNIX_BRIDGE_CONNECTION_FAILED'));
}

async function version(socketPath: string): Promise<void> {
  let resolveVersion!: () => void;
  const completed = new Promise<void>((resolve) => {
    resolveVersion = resolve;
  });
  const connected = await websocket(socketPath, (text) => {
    let response: unknown;
    try {
      response = JSON.parse(text);
    } catch {
      fail('APP_SERVER_UNIX_BRIDGE_MALFORMED');
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
    const value = response.result.userAgent.match(/\b\d+\.\d+\.\d+\b/)?.[0];
    if (!value) fail('APP_SERVER_UNIX_BRIDGE_VERSION');
    connected.frames.text(JSON.stringify({ method: 'initialized' }));
    process.stdout.write(`codex-cli ${value}\n`);
    resolveVersion();
  });
  connected.frames.text(
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
  await completed;
  connected.frames.close();
}

async function connect(socketPath: string): Promise<void> {
  const connected = await websocket(socketPath, (text) =>
    process.stdout.write(`${text}\n`),
  );
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    assertBridgeMessageSize(Buffer.byteLength(line), MAX_MESSAGE_BYTES);
    connected.frames.text(line);
  });
  lines.once('close', () => connected.frames.close());
  await new Promise<void>((resolve) =>
    connected.socket.once('close', () => {
      lines.close();
      process.stdin.pause();
      resolve();
    }),
  );
}

const parsed = options();
if (parsed.mode === '--version') await version(parsed.socketPath);
else await connect(parsed.socketPath);
