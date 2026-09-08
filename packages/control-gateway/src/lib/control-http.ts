import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { extname, isAbsolute, resolve } from 'node:path';

import type {
  CodexControlPlane,
  ControlAuthorization,
} from './control-gateway.js';

export interface ControlHttpServerOptions {
  readonly control: CodexControlPlane;
  readonly authorization?: ControlAuthorization;
  readonly token: string;
  readonly uiDirectory: string;
  readonly host?: '127.0.0.1';
  readonly port?: number;
}

export interface ControlHttpServer {
  start(): Promise<{ readonly origin: string }>;
  stop(): Promise<void>;
}

export interface ControlHttpClientOptions extends ControlAuthorization {
  readonly origin: string;
  readonly token: string;
}

class ControlHttpError extends Error {
  override readonly name = 'ControlHttpError';
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CURSOR = /^(0|[1-9]\d*)$/;
const MAX_BODY_BYTES = 131_072;
const BROWSER_AUTHORIZATION = Object.freeze({
  actorAgentId: 'codex-control-browser',
  scopes: ['control:read'],
});

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ControlHttpError('CONTROL_REQUEST_INVALID');
  return value as Record<string, unknown>;
}

function loopbackOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ControlHttpError('CONTROL_ORIGIN_INVALID');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new ControlHttpError('CONTROL_ORIGIN_INVALID');
  return url.origin;
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function writeJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES)
      throw new ControlHttpError('CONTROL_REQUEST_TOO_LARGE', 413);
    chunks.push(bytes);
  }
  try {
    return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (error) {
    if (error instanceof ControlHttpError) throw error;
    throw new ControlHttpError('CONTROL_REQUEST_INVALID');
  }
}

function readQuery(url: URL, wait: boolean) {
  const allowed = new Set([
    'selectedAgentId',
    'selectionId',
    ...(wait ? ['afterCursor', 'waitMs'] : []),
  ]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
    throw new ControlHttpError('CONTROL_REQUEST_INVALID');
  const selectedAgentId = url.searchParams.get('selectedAgentId') ?? undefined;
  const selectionId = url.searchParams.get('selectionId') ?? undefined;
  if (
    (selectedAgentId !== undefined && !ID.test(selectedAgentId)) ||
    (selectionId !== undefined && !ID.test(selectionId))
  )
    throw new ControlHttpError('CONTROL_REQUEST_INVALID');
  if (!wait) return { selectedAgentId, selectionId };
  const afterCursor = url.searchParams.get('afterCursor');
  const waitMs = Number(url.searchParams.get('waitMs'));
  if (
    afterCursor === null ||
    !CURSOR.test(afterCursor) ||
    !Number.isInteger(waitMs) ||
    waitMs < 0 ||
    waitMs > 30_000
  )
    throw new ControlHttpError('CONTROL_REQUEST_INVALID');
  return { afterCursor, waitMs, selectedAgentId, selectionId };
}

function requestAbort(
  request: IncomingMessage,
  response: ServerResponse,
  controllers: Set<AbortController>,
): AbortController {
  const controller = new AbortController();
  controllers.add(controller);
  const abort = () => controller.abort();
  request.once('aborted', abort);
  response.once('close', () => {
    controllers.delete(controller);
    if (!response.writableEnded) abort();
  });
  return controller;
}

async function invoke(
  control: CodexControlPlane,
  operation: string,
  input: unknown,
  authorization: ControlAuthorization,
  signal: AbortSignal,
) {
  const value = object(input);
  switch (operation) {
    case 'delegateAgent':
      return control.delegateAgent(value, authorization);
    case 'continueAgent':
      if (control.continueAgent) return control.continueAgent(value, authorization);
      throw new ControlHttpError('CONTROL_NOT_CONFIGURED', 503);
    case 'sendAgentMessage':
      return control.sendAgentMessage('send', value, authorization);
    case 'askAgent':
      return control.sendAgentMessage('ask', value, authorization);
    case 'replyAgent':
      return control.sendAgentMessage('reply', value, authorization);
    case 'runWorkflow':
      return control.runWorkflow(value, authorization);
    case 'cancelAgent':
      return control.cancelAgent(
        String(value['delegationId'] ?? ''),
        authorization,
      );
    case 'cancelWorkflow':
      return control.cancelWorkflow(
        String(value['runId'] ?? ''),
        authorization,
      );
    case 'snapshot':
      return control.snapshot(value, authorization);
    case 'wait':
      return control.wait(value as never, authorization, signal);
    default:
      throw new ControlHttpError('CONTROL_OPERATION_UNKNOWN', 404);
  }
}

function code(error: unknown): string {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'CONTROL_OPERATION_FAILED';
}

export function createControlHttpServer(
  options: ControlHttpServerOptions,
): ControlHttpServer {
  if (
    !options ||
    typeof options.control !== 'object' ||
    Buffer.byteLength(options.token ?? '', 'utf8') < 32 ||
    !isAbsolute(options.uiDirectory) ||
    (options.host !== undefined && options.host !== '127.0.0.1') ||
    !Number.isInteger(options.port ?? 0) ||
    (options.port ?? 0) < 0 ||
    (options.port ?? 0) > 65_535
  )
    throw new ControlHttpError('CONTROL_RUNTIME_INVALID');

  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 4765;
  const uiDirectory = resolve(options.uiDirectory);
  const authorization = options.authorization ?? {
    actorAgentId: 'codex-control',
    scopes: [
      'control:delegate',
      'control:message',
      'control:workflow',
      'control:cancel',
      'control:read',
    ],
  };
  let server: Server | undefined;
  let origin: string | undefined;
  const controllers = new Set<AbortController>();

  const handler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    try {
      if (!origin) throw new ControlHttpError('CONTROL_NOT_READY', 503);
      const url = new URL(request.url ?? '/', origin);
      const expectedHost = new URL(origin).host;
      if (request.headers.host !== expectedHost)
        throw new ControlHttpError('CONTROL_HOST_INVALID', 403);
      if (request.headers.origin && request.headers.origin !== origin)
        throw new ControlHttpError('CONTROL_ORIGIN_DENIED', 403);

      if (
        request.method === 'GET' &&
        url.pathname === '/api/control/snapshot'
      ) {
        writeJson(
          response,
          200,
          await options.control.snapshot(
            readQuery(url, false),
            BROWSER_AUTHORIZATION,
          ),
        );
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/control/wait') {
        const controller = requestAbort(request, response, controllers);
        writeJson(
          response,
          200,
          await options.control.wait(
            readQuery(url, true) as never,
            BROWSER_AUTHORIZATION,
            controller.signal,
          ),
        );
        return;
      }
      if (
        request.method === 'POST' &&
        url.pathname.startsWith('/api/control/')
      ) {
        const bearer =
          request.headers.authorization?.replace(/^Bearer /, '') ?? '';
        if (!secureEqual(bearer, options.token))
          throw new ControlHttpError('CONTROL_UNAUTHORIZED', 401);
        const controller = requestAbort(request, response, controllers);
        const operation = url.pathname.slice('/api/control/'.length);
        writeJson(
          response,
          200,
          await invoke(
            options.control,
            operation,
            await readJson(request),
            authorization,
            controller.signal,
          ),
        );
        return;
      }
      if (url.pathname.startsWith('/api/'))
        throw new ControlHttpError('CONTROL_OPERATION_UNKNOWN', 404);
      if (request.method !== 'GET' && request.method !== 'HEAD')
        throw new ControlHttpError('CONTROL_METHOD_INVALID', 405);

      const assetPath = url.pathname.startsWith('/assets/')
        ? resolve(uiDirectory, `.${url.pathname}`)
        : resolve(uiDirectory, 'index.html');
      if (assetPath !== uiDirectory && !assetPath.startsWith(`${uiDirectory}/`))
        throw new ControlHttpError('CONTROL_ASSET_INVALID', 404);
      const metadata = await stat(assetPath);
      if (!metadata.isFile())
        throw new ControlHttpError('CONTROL_ASSET_INVALID', 404);
      const body = await readFile(assetPath);
      response.writeHead(200, {
        'cache-control': assetPath.endsWith('index.html')
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
        'content-type': MIME[extname(assetPath)] ?? 'application/octet-stream',
        'content-security-policy':
          "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = error instanceof ControlHttpError ? error.status : 500;
      if (!response.headersSent)
        writeJson(response, status, { code: code(error) });
      else response.destroy();
    }
  };

  return Object.freeze({
    async start() {
      if (server && origin) return { origin };
      const created = createServer((request, response) => {
        void handler(request, response);
      });
      try {
        await new Promise<void>((resolveStart, reject) => {
          created.once('error', reject);
          created.listen(requestedPort, host, () => {
            created.off('error', reject);
            resolveStart();
          });
        });
      } catch (error) {
        created.close();
        throw error;
      }
      const address = created.address();
      if (!address || typeof address === 'string') {
        created.close();
        throw new ControlHttpError('CONTROL_LISTENER_INVALID');
      }
      server = created;
      origin = `http://${host}:${address.port}`;
      return { origin };
    },
    async stop() {
      const active = server;
      server = undefined;
      origin = undefined;
      if (!active) return;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      await new Promise<void>((resolveStop, reject) => {
        active.close((error) => (error ? reject(error) : resolveStop()));
        active.closeAllConnections();
      });
    },
  });
}

export function createControlHttpClient(
  options: ControlHttpClientOptions,
): CodexControlPlane {
  const origin = loopbackOrigin(options.origin);
  if (
    Buffer.byteLength(options.token ?? '', 'utf8') < 32 ||
    !ID.test(options.actorAgentId) ||
    !Array.isArray(options.scopes) ||
    options.scopes.some((scope) => !ID.test(scope))
  )
    throw new ControlHttpError('CONTROL_CLIENT_INVALID');

  const call = async (
    operation: string,
    input: unknown,
    signal?: AbortSignal,
  ) => {
    const response = await fetch(`${origin}/api/control/${operation}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      signal,
    });
    const value = (await response.json()) as unknown;
    if (!response.ok) {
      const error = new ControlHttpError(code(value), response.status);
      throw error;
    }
    return value;
  };

  const control: CodexControlPlane = {
    delegateAgent: (command) => call('delegateAgent', command),
    continueAgent: (command) => call('continueAgent', command),
    sendAgentMessage: (kind, command) =>
      call(
        kind === 'send'
          ? 'sendAgentMessage'
          : kind === 'ask'
            ? 'askAgent'
            : 'replyAgent',
        command,
      ),
    runWorkflow: (command) => call('runWorkflow', command),
    cancelAgent: (delegationId) => call('cancelAgent', { delegationId }),
    cancelWorkflow: (runId) => call('cancelWorkflow', { runId }),
    snapshot: (query) => call('snapshot', query),
    wait: (query, _authorization, signal) => call('wait', query, signal),
  };
  return Object.freeze(control);
}
