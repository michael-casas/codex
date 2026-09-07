import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import {
  APP_SERVER_PROTOCOL_VERSION,
  APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES,
  APP_SERVER_MAX_MESSAGE_BYTES,
  AppServerClientError,
  type AppServerClient,
  type AppServerClientDiagnostics,
  type AppServerClientErrorCode,
  type AppServerClientMetrics,
  type AppServerClientOptions,
  type AppServerInboundMessage,
  type AppServerJson,
  type AppServerRequestId,
  type AppServerRequestOptions,
  type AppServerThreadRef,
  type AppServerThreadStart,
  type AppServerTurnRef,
  type AppServerTurnStart,
} from './app-server-client.types.js';

const DEFAULT_MAX_BUFFERED_MESSAGES = 256;
const MAX_DIAGNOSTIC_BYTES = 4096;
const BRIDGE_DIAGNOSTIC_PREFIX = 'CODEX_BRIDGE_DIAGNOSTIC:';
const DEFAULT_MAX_PENDING_REQUESTS = 128;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 2_000;

interface ResolvedOptions {
  command: string;
  versionArgs: readonly string[];
  serverArgs: readonly string[];
  expectedVersion: string;
  clientInfo: AppServerClientOptions['clientInfo'];
  capabilities: AppServerJson;
  cwd?: string;
  env: NodeJS.ProcessEnv;
  maxBufferedMessages: number;
  maxCanceledResponses: number;
  maxMessageBytes: number;
  maxPendingRequests: number;
  requestTimeoutMs: number;
  closeTimeoutMs: number;
}

interface PendingRequest {
  method: string;
  written: boolean;
  resolve(value: AppServerJson): void;
  reject(error: AppServerClientError): void;
  cleanup(): void;
}

function error(
  code: AppServerClientErrorCode,
  message: string,
  details: ConstructorParameters<typeof AppServerClientError>[2] = {},
): AppServerClientError {
  return new AppServerClientError(code, message, details);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw error('INVALID_OPTIONS', `Invalid App Server option: ${name}`);
  }
  return value;
}

function messageLimit(value: number): number {
  positiveInteger(value, 'maxMessageBytes');
  if (value > APP_SERVER_MAX_MESSAGE_BYTES) {
    throw error(
      'INVALID_OPTIONS',
      'Invalid App Server option: maxMessageBytes',
    );
  }
  return value;
}

function oversizedMessage(observedBytes: number, limitBytes: number) {
  return error('MESSAGE_TOO_LARGE', 'App Server message exceeds limit', {
    observedBytes,
    limitBytes,
    retryable: false,
  });
}

function parseBridgeDiagnostic(line: Buffer): AppServerClientError | undefined {
  const text = line.toString('utf8');
  if (!text.startsWith(BRIDGE_DIAGNOSTIC_PREFIX)) return;
  try {
    const value: unknown = JSON.parse(
      text.slice(BRIDGE_DIAGNOSTIC_PREFIX.length),
    );
    if (
      !isRecord(value) ||
      Object.keys(value).sort().join(',') !==
        'code,limitBytes,observedBytes,retryable'
    )
      return;
    const { code, observedBytes, limitBytes, retryable } = value;
    if (
      code !== 'MESSAGE_TOO_LARGE' ||
      retryable !== false ||
      typeof observedBytes !== 'number' ||
      typeof limitBytes !== 'number' ||
      !Number.isSafeInteger(observedBytes) ||
      !Number.isSafeInteger(limitBytes) ||
      limitBytes <= 0 ||
      observedBytes <= limitBytes ||
      limitBytes > APP_SERVER_MAX_MESSAGE_BYTES
    )
      return;
    return oversizedMessage(observedBytes, limitBytes);
  } catch {
    // Stderr is untrusted diagnostics, never a payload or error passthrough.
    return;
  }
}

function nonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw error('INVALID_OPTIONS', `Invalid App Server option: ${name}`);
  }
  return value;
}

function isJson(value: unknown): value is AppServerJson {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value).every(isJson)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is AppServerRequestId {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value)) ||
    (typeof value === 'string' && value.length > 0)
  );
}

function resolveOptions(options: AppServerClientOptions): ResolvedOptions {
  if (!isRecord(options) || !isRecord(options.clientInfo)) {
    throw error('INVALID_OPTIONS', 'Invalid App Server options');
  }
  if (options.expectedVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw error('VERSION_MISMATCH', 'App Server protocol version mismatch', {
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      actualVersion: options.expectedVersion,
    });
  }
  if (!isJson(options.capabilities ?? null)) {
    throw error('INVALID_OPTIONS', 'Invalid App Server option: capabilities');
  }
  return {
    command: nonEmpty(options.command ?? 'codex', 'command'),
    versionArgs: options.versionArgs ?? ['--version'],
    serverArgs: options.serverArgs ?? ['app-server', '--listen', 'stdio://'],
    expectedVersion: options.expectedVersion,
    clientInfo: {
      name: nonEmpty(options.clientInfo.name, 'clientInfo.name'),
      title: nonEmpty(options.clientInfo.title, 'clientInfo.title'),
      version: nonEmpty(options.clientInfo.version, 'clientInfo.version'),
    },
    capabilities: options.capabilities ?? null,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: { ...process.env, ...options.env },
    maxBufferedMessages: positiveInteger(
      options.maxBufferedMessages ?? DEFAULT_MAX_BUFFERED_MESSAGES,
      'maxBufferedMessages',
    ),
    maxCanceledResponses: positiveInteger(
      options.maxCanceledResponses ??
        options.maxPendingRequests ??
        DEFAULT_MAX_PENDING_REQUESTS,
      'maxCanceledResponses',
    ),
    maxMessageBytes: messageLimit(
      options.maxMessageBytes ?? APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES,
    ),
    maxPendingRequests: positiveInteger(
      options.maxPendingRequests ?? DEFAULT_MAX_PENDING_REQUESTS,
      'maxPendingRequests',
    ),
    requestTimeoutMs: positiveInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      'requestTimeoutMs',
    ),
    closeTimeoutMs: positiveInteger(
      options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
      'closeTimeoutMs',
    ),
  };
}

async function readCliVersion(options: ResolvedOptions): Promise<string> {
  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      options.command,
      [...options.versionArgs],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.requestTimeoutMs,
        maxBuffer: 4_096,
        encoding: 'utf8',
      },
      (cause, stdout) => {
        if (cause) {
          reject(
            error('VERSION_CHECK_FAILED', 'App Server version check failed'),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
  const actualVersion = output.match(/\b\d+\.\d+\.\d+\b/)?.[0];
  if (!actualVersion) {
    throw error('VERSION_CHECK_FAILED', 'App Server version check failed');
  }
  if (actualVersion !== options.expectedVersion) {
    throw error('VERSION_MISMATCH', 'App Server CLI version mismatch', {
      expectedVersion: options.expectedVersion,
      actualVersion,
    });
  }
  return actualVersion;
}

class StdioAppServerClient implements AppServerClient {
  diagnostics!: AppServerClientDiagnostics;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly canceled = new Set<number>();
  private readonly inbound: AppServerInboundMessage[] = [];
  private readBuffer = Buffer.alloc(0);
  private nextId = 0;
  private handshake: 'new' | 'initializing' | 'ready' = 'new';
  private closed = false;
  private closing = false;
  private childExited = false;
  private feedActive = false;
  private failure?: AppServerClientError;
  private wakeFeed?: () => void;
  private closePromise?: Promise<void>;
  private diagnosticBuffer = Buffer.alloc(0);
  private discardingDiagnostic = false;
  private terminalTimer?: NodeJS.Timeout;

  constructor(
    private readonly options: ResolvedOptions,
    private readonly child: ChildProcessWithoutNullStreams,
    serverVersion: string,
  ) {
    this.child.stderr.on('data', (chunk: Buffer) => this.onStderr(chunk));
    this.child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.child.stdout.once('end', () => this.onEof());
    this.child.once('error', () =>
      this.fail(error('CONNECTION_CLOSED', 'App Server process failed')),
    );
    this.child.once('exit', () => this.onExit());
    this.child.once('close', () => this.failConnectionClosed());
    this.child.stdin.on('error', () => {
      if (!this.closing) {
        this.onEof();
      }
    });
    this.diagnostics = Object.freeze({
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      serverVersion,
      platformFamily: '',
      platformOs: '',
    });
  }

  async initialize(): Promise<void> {
    if (this.handshake !== 'new') {
      throw error(
        'ALREADY_INITIALIZED',
        'App Server client already initialized',
      );
    }
    this.handshake = 'initializing';
    const result = await this.requestInternal<Record<string, AppServerJson>>(
      'initialize',
      {
        clientInfo: this.options.clientInfo,
        capabilities: this.options.capabilities,
      },
    );
    const userAgent = result.userAgent;
    const codexHome = result.codexHome;
    const platformFamily = result.platformFamily;
    const platformOs = result.platformOs;
    if (
      typeof userAgent !== 'string' ||
      typeof codexHome !== 'string' ||
      typeof platformFamily !== 'string' ||
      typeof platformOs !== 'string'
    ) {
      this.fail(error('MALFORMED_MESSAGE', 'Malformed App Server response'));
      throw this.failure;
    }
    await this.write({ method: 'initialized' });
    this.handshake = 'ready';
    this.diagnostics = Object.freeze({
      ...this.diagnostics,
      platformFamily,
      platformOs,
    });
  }

  request<T extends AppServerJson = AppServerJson>(
    method: string,
    params?: AppServerJson,
    options: AppServerRequestOptions = {},
  ): Promise<T> {
    if (this.handshake !== 'ready') {
      return Promise.reject(
        error(
          method === 'initialize' ? 'ALREADY_INITIALIZED' : 'NOT_INITIALIZED',
          'App Server client is not available for requests',
        ),
      );
    }
    if (method === 'initialize') {
      return Promise.reject(
        error('ALREADY_INITIALIZED', 'App Server client already initialized'),
      );
    }
    return this.requestInternal<T>(method, params, options);
  }

  private async requestInternal<T extends AppServerJson>(
    method: string,
    params?: AppServerJson,
    options: AppServerRequestOptions = {},
  ): Promise<T> {
    nonEmpty(method, 'method');
    if (params !== undefined && !isJson(params)) {
      throw error('INVALID_REQUEST', 'Invalid App Server request', { method });
    }
    if (options.signal?.aborted) {
      throw error('REQUEST_ABORTED', 'App Server request aborted', { method });
    }
    if (this.failure) throw this.failure;
    if (this.closed || this.closing) {
      throw error('CLIENT_CLOSED', 'App Server client is closed', { method });
    }
    if (this.pending.size >= this.options.maxPendingRequests) {
      throw error('CAPACITY_EXCEEDED', 'App Server request capacity exceeded', {
        method,
      });
    }

    const id = this.nextId++;
    const timeoutMs = positiveInteger(
      options.timeoutMs ?? this.options.requestTimeoutMs,
      'timeoutMs',
    );
    let timeout: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    let pending!: PendingRequest;
    const response = new Promise<AppServerJson>((resolve, reject) => {
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (abort && options.signal) {
          options.signal.removeEventListener('abort', abort);
        }
      };
      pending = {
        method,
        written: false,
        resolve,
        reject,
        cleanup,
      };
      const cancel = (failure: AppServerClientError) => {
        if (!this.pending.delete(id)) return;
        cleanup();
        if (pending.written) {
          if (this.canceled.size >= this.options.maxCanceledResponses) {
            this.fail(
              error(
                'BACKPRESSURE',
                'App Server cancellation capacity exceeded',
              ),
            );
          } else {
            this.canceled.add(id);
          }
        }
        reject(failure);
      };
      timeout = setTimeout(
        () =>
          cancel(
            error('REQUEST_TIMEOUT', 'App Server request timed out', {
              method,
            }),
          ),
        timeoutMs,
      );
      abort = () =>
        cancel(
          error('REQUEST_ABORTED', 'App Server request aborted', { method }),
        );
      options.signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, pending);
    });

    try {
      pending.written = true;
      await this.write({
        method,
        id,
        ...(params === undefined ? {} : { params }),
      });
    } catch (cause) {
      if (this.pending.delete(id)) {
        pending.cleanup();
        pending.reject(
          cause instanceof AppServerClientError
            ? cause
            : error('CONNECTION_CLOSED', 'App Server request was not written', {
                method,
              }),
        );
      }
    }
    return (await response) as T;
  }

  async *messages(options: { signal?: AbortSignal } = {}) {
    if (this.feedActive) {
      throw error(
        'FEED_ALREADY_ACTIVE',
        'App Server feed already has a consumer',
      );
    }
    this.feedActive = true;
    try {
      while (true) {
        if (options.signal?.aborted) {
          throw error('REQUEST_ABORTED', 'App Server feed aborted');
        }
        const next = this.inbound.shift();
        if (next) {
          yield next;
          continue;
        }
        if (this.failure) throw this.failure;
        if (this.closed) return;
        await new Promise<void>((resolve) => {
          const wake = () => {
            options.signal?.removeEventListener('abort', wake);
            if (this.wakeFeed === wake) this.wakeFeed = undefined;
            resolve();
          };
          this.wakeFeed = wake;
          options.signal?.addEventListener('abort', wake, { once: true });
        });
      }
    } finally {
      this.feedActive = false;
    }
  }

  async respond(
    id: AppServerRequestId,
    response:
      | { result: AppServerJson }
      | { error: { code: number; message: string } },
  ): Promise<void> {
    if (!isRequestId(id) || !isJson(response)) {
      throw error('INVALID_REQUEST', 'Invalid App Server response');
    }
    if (this.failure) throw this.failure;
    if (this.closed || this.closing) {
      throw error('CLIENT_CLOSED', 'App Server client is closed');
    }
    await this.write({ id, ...response });
  }

  async startThread(params: AppServerThreadStart): Promise<AppServerThreadRef> {
    const request: AppServerJson = {
      model: params.model,
      cwd: params.cwd,
      approvalPolicy:
        params.approvalPolicy === 'onRequest'
          ? 'on-request'
          : params.approvalPolicy,
      sandbox:
        params.sandbox === 'readOnly'
          ? 'read-only'
          : params.sandbox === 'workspaceWrite'
            ? 'workspace-write'
            : 'danger-full-access',
    };
    const result = await this.request<Record<string, AppServerJson>>(
      'thread/start',
      request,
    );
    const thread = result.thread;
    if (!isRecord(thread)) {
      throw error('MALFORMED_MESSAGE', 'Malformed App Server thread response');
    }
    const threadId = thread.id;
    const sessionId = thread.sessionId;
    if (typeof threadId !== 'string' || typeof sessionId !== 'string') {
      throw error('MALFORMED_MESSAGE', 'Malformed App Server thread response');
    }
    return { threadId, sessionId };
  }

  async startTurn(params: AppServerTurnStart): Promise<AppServerTurnRef> {
    const request: AppServerJson = {
      threadId: params.threadId,
      input: params.input.map((item) => ({ ...item, text_elements: [] })),
      ...(params.model === undefined ? {} : { model: params.model }),
      ...(params.effort === undefined ? {} : { effort: params.effort }),
    };
    const result = await this.request<Record<string, AppServerJson>>(
      'turn/start',
      request,
    );
    const turn = result.turn;
    if (!isRecord(turn) || typeof turn.id !== 'string') {
      throw error('MALFORMED_MESSAGE', 'Malformed App Server turn response');
    }
    return { turnId: turn.id };
  }

  async interruptTurn(params: {
    threadId: string;
    turnId: string;
  }): Promise<void> {
    await this.request('turn/interrupt', params);
  }

  metrics(): AppServerClientMetrics {
    return Object.freeze({
      pendingRequests: this.pending.size,
      bufferedMessages: this.inbound.length,
      canceledResponses: this.canceled.size,
      closed: this.closed,
      childExited: this.childExited,
      ...(this.failure ? { failureCode: this.failure.code } : {}),
    });
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeNow();
    return this.closePromise;
  }

  private async closeNow(): Promise<void> {
    clearTimeout(this.terminalTimer);
    this.diagnosticBuffer = Buffer.alloc(0);
    this.closing = true;
    this.closed = true;
    const failure = error('CLIENT_CLOSED', 'App Server client is closed');
    this.rejectPending(failure);
    this.canceled.clear();
    this.inbound.length = 0;
    this.wake();
    if (!this.childExited) {
      this.child.stdin.end();
      if (!(await this.waitForExit(this.options.closeTimeoutMs))) {
        this.child.kill('SIGTERM');
        if (!(await this.waitForExit(this.options.closeTimeoutMs))) {
          this.child.kill('SIGKILL');
          await this.waitForExit(this.options.closeTimeoutMs);
        }
      }
    }
    this.closing = false;
  }

  private async waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.childExited) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.removeListener('exit', exited);
        resolve(false);
      }, timeoutMs);
      const exited = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.child.once('exit', exited);
    });
  }

  private async write(message: AppServerJson): Promise<void> {
    if (!isJson(message)) {
      throw error('INVALID_REQUEST', 'Invalid App Server message');
    }
    const encoded = JSON.stringify(message);
    const observedBytes = Buffer.byteLength(encoded);
    if (observedBytes > this.options.maxMessageBytes) {
      throw oversizedMessage(observedBytes, this.options.maxMessageBytes);
    }
    const payload = `${encoded}\n`;
    if (this.failure) throw this.failure;
    if (this.closed && !this.closing) {
      throw error('CLIENT_CLOSED', 'App Server client is closed');
    }
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(payload, (cause) => {
        if (cause) {
          reject(error('CONNECTION_CLOSED', 'App Server input closed'));
        } else {
          resolve();
        }
      });
    });
  }

  private onData(chunk: Buffer): void {
    if (this.failure || this.closing) return;
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const segment = chunk.subarray(offset, end);
      const observedBytes = this.readBuffer.length + segment.length;
      if (observedBytes > this.options.maxMessageBytes) {
        this.fail(
          oversizedMessage(observedBytes, this.options.maxMessageBytes),
        );
        return;
      }
      this.readBuffer = Buffer.concat([this.readBuffer, segment]);
      if (newline < 0) return;
      const line = this.readBuffer;
      this.readBuffer = Buffer.alloc(0);
      offset = newline + 1;
      if (line.length === 0) continue;
      try {
        this.onMessage(JSON.parse(line.toString('utf8')));
      } catch (cause) {
        if (cause instanceof AppServerClientError) {
          this.fail(cause);
        } else {
          this.fail(error('MALFORMED_MESSAGE', 'Malformed App Server message'));
        }
        return;
      }
      if (this.failure) return;
    }
  }

  private onMessage(value: unknown): void {
    if (!isRecord(value)) {
      throw error('MALFORMED_MESSAGE', 'Malformed App Server message');
    }
    const hasMethod = typeof value.method === 'string';
    const hasId = Object.hasOwn(value, 'id');
    const hasResult = Object.hasOwn(value, 'result');
    const hasError = Object.hasOwn(value, 'error');

    if (!hasMethod && hasId) {
      if (!isRequestId(value.id) || hasResult === hasError) {
        throw error('MALFORMED_MESSAGE', 'Malformed App Server response');
      }
      this.onResponse(value.id, value);
      return;
    }

    if (hasMethod && !hasResult && !hasError) {
      const params = value.params ?? null;
      if (!isJson(params)) {
        throw error('MALFORMED_MESSAGE', 'Malformed App Server message');
      }
      if (hasId) {
        if (!isRequestId(value.id)) {
          throw error('MALFORMED_MESSAGE', 'Malformed App Server request');
        }
        this.enqueue({
          kind: 'server-request',
          id: value.id,
          method: value.method as string,
          params,
        });
      } else {
        this.enqueue({
          kind: 'notification',
          method: value.method as string,
          params,
        });
      }
      return;
    }

    throw error('MALFORMED_MESSAGE', 'Malformed App Server message');
  }

  private onResponse(
    id: AppServerRequestId,
    value: Record<string, unknown>,
  ): void {
    if (typeof id !== 'number') {
      throw error('UNMATCHED_RESPONSE', 'Unmatched App Server response');
    }
    if (this.canceled.delete(id)) return;
    const pending = this.pending.get(id);
    if (!pending) {
      throw error('UNMATCHED_RESPONSE', 'Unmatched App Server response');
    }
    this.pending.delete(id);
    pending.cleanup();
    if (Object.hasOwn(value, 'error')) {
      const providerError = value.error;
      if (!isRecord(providerError) || typeof providerError.code !== 'number') {
        const failure = error(
          'MALFORMED_MESSAGE',
          'Malformed App Server error response',
          { method: pending.method },
        );
        pending.reject(failure);
        this.fail(failure);
        return;
      }
      pending.reject(
        error('REQUEST_FAILED', 'App Server request failed', {
          method: pending.method,
          providerCode: providerError.code,
        }),
      );
      return;
    }
    if (!isJson(value.result)) {
      const failure = error(
        'MALFORMED_MESSAGE',
        'Malformed App Server response',
        {
          method: pending.method,
        },
      );
      pending.reject(failure);
      this.fail(failure);
      return;
    }
    pending.resolve(value.result);
  }

  private enqueue(message: AppServerInboundMessage): void {
    if (this.inbound.length >= this.options.maxBufferedMessages) {
      this.fail(
        error('BACKPRESSURE', 'App Server inbound feed exceeded limit'),
      );
      return;
    }
    this.inbound.push(message);
    this.wake();
  }

  private onEof(): void {
    if (this.closing || this.failure || this.terminalTimer) return;
    // Separate pipes may deliver the terminal diagnostic after stdout EOF.
    // Child close guarantees pipe drainage; a live half-closed child is bounded.
    this.terminalTimer = setTimeout(
      () => this.failConnectionClosed(),
      this.options.closeTimeoutMs,
    );
  }

  private failConnectionClosed(): void {
    if (this.closing || this.closed) return;
    this.fail(
      error('CONNECTION_CLOSED', 'App Server connection closed', {
        ambiguous: [...this.pending.values()].some((entry) => entry.written),
      }),
    );
  }

  private onExit(): void {
    this.childExited = true;
    this.onEof();
    this.wake();
  }

  private onStderr(chunk: Buffer): void {
    if (this.failure || this.closing) return;
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const segment = chunk.subarray(offset, end);
      if (
        this.diagnosticBuffer.length + segment.length >
        MAX_DIAGNOSTIC_BYTES
      ) {
        this.discardingDiagnostic = true;
        this.diagnosticBuffer = Buffer.alloc(0);
      }
      if (!this.discardingDiagnostic)
        this.diagnosticBuffer = Buffer.concat([this.diagnosticBuffer, segment]);
      if (newline < 0) return;
      const diagnostic = this.discardingDiagnostic
        ? undefined
        : parseBridgeDiagnostic(this.diagnosticBuffer);
      this.diagnosticBuffer = Buffer.alloc(0);
      this.discardingDiagnostic = false;
      if (diagnostic) {
        this.fail(diagnostic);
        return;
      }
      offset = newline + 1;
    }
  }

  private fail(failure: AppServerClientError): void {
    if (this.failure || this.closing) return;
    clearTimeout(this.terminalTimer);
    this.diagnosticBuffer = Buffer.alloc(0);
    this.failure = failure;
    this.closed = true;
    this.readBuffer = Buffer.alloc(0);
    this.inbound.length = 0;
    this.canceled.clear();
    this.rejectPending(failure);
    this.wake();
    if (!this.childExited) this.child.kill('SIGTERM');
  }

  private rejectPending(failure: AppServerClientError): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(failure);
    }
    this.pending.clear();
  }

  private wake(): void {
    const wake = this.wakeFeed;
    this.wakeFeed = undefined;
    wake?.();
  }
}

export async function connectAppServer(
  input: AppServerClientOptions,
): Promise<AppServerClient> {
  const options = resolveOptions(input);
  const serverVersion = await readCliVersion(options);
  const child = spawn(options.command, [...options.serverArgs], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new StdioAppServerClient(options, child, serverVersion);
  try {
    await client.initialize();
    return client;
  } catch (cause) {
    await client.close();
    throw cause;
  }
}
