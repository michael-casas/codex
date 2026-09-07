import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES,
  APP_SERVER_MAX_MESSAGE_BYTES,
  APP_SERVER_PROTOCOL_VERSION,
  type AppServerClient,
  type AppServerClientDiagnostics,
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
} from '@codex/codex';

export const APP_SERVER_HOST_CAPABILITIES = Object.freeze([
  'json-rpc',
  'reconnect',
  'server-requests',
  'thread-events',
] as const);

export type AppServerHostCapability =
  (typeof APP_SERVER_HOST_CAPABILITIES)[number];

export type AppServerHostInput =
  | {
      hostId: string;
      transport: 'local-proxy';
      expectedVersion: string;
      codexHome?: string;
      socketPath?: string;
      requiredCapabilities?: string[];
    }
  | {
      hostId: string;
      transport: 'remote-wss';
      endpoint: string;
      credentialRef: string;
      expectedVersion: string;
      caCertificatePath?: string;
      requiredCapabilities?: string[];
    };

export interface AppServerHostSummary {
  readonly hostId: string;
  readonly transport: AppServerHostInput['transport'];
  readonly endpoint: string;
  readonly expectedVersion: string;
  readonly enabled: boolean;
  readonly capabilities: readonly AppServerHostCapability[];
}

export interface AppServerHostHealth {
  readonly available: true;
  readonly serverVersion: string;
  readonly capabilities: readonly AppServerHostCapability[];
}

export type AppServerHostErrorCode =
  | 'CAPABILITY_MISMATCH'
  | 'HOST_AUTHENTICATION_FAILED'
  | 'HOST_CLOSED'
  | 'HOST_CONFLICT'
  | 'HOST_CONNECTION_LOST'
  | 'HOST_DISABLED'
  | 'HOST_NOT_FOUND'
  | 'HOST_REQUEST_FAILED'
  | 'HOST_UNAVAILABLE'
  | 'INVALID_HOST'
  | 'MESSAGE_TOO_LARGE'
  | 'SUBSCRIPTION_CONFLICT'
  | 'VERSION_MISMATCH';

export class AppServerHostError extends Error {
  override readonly name = 'AppServerHostError';
  readonly ambiguous?: boolean;
  readonly hostId?: string;
  readonly method?: string;
  readonly providerCode?: number;
  readonly observedBytes?: number;
  readonly limitBytes?: number;
  readonly retryable?: boolean;

  constructor(
    readonly code: AppServerHostErrorCode,
    message: string,
    details: {
      ambiguous?: boolean;
      hostId?: string;
      method?: string;
      providerCode?: number;
      observedBytes?: number;
      limitBytes?: number;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.ambiguous = details.ambiguous;
    this.hostId = details.hostId;
    this.method = details.method;
    this.providerCode = details.providerCode;
    this.observedBytes = details.observedBytes;
    this.limitBytes = details.limitBytes;
    this.retryable = details.retryable;
  }
}

export interface AppServerHostConnection extends AppServerClient {
  readonly hostId: string;
  reconnect(): Promise<void>;
  subscribe<T extends AppServerJson = AppServerJson>(
    key: string,
    method: string,
    params?: AppServerJson,
  ): Promise<T>;
  hostMetrics(): {
    reconnectAttempts: number;
    subscriptions: number;
    closed: boolean;
  };
}

export interface AppServerHostRegistry {
  register(input: AppServerHostInput): AppServerHostSummary;
  read(hostId: string): AppServerHostSummary | undefined;
  connect(hostId: string): Promise<AppServerHostConnection>;
  health(hostId: string): Promise<AppServerHostHealth>;
  restart(hostId: string): Promise<void>;
  disable(hostId: string): Promise<void>;
}

export interface AppServerHostRegistryOptions {
  maxMessageBytes?: number;
  connectAppServer(options: AppServerClientOptions): Promise<AppServerClient>;
  resolveCredential(ref: string): Promise<string>;
  bunCommand?: string;
  bridgePath?: string;
  unixBridgePath?: string;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type NormalizedHost =
  | {
      hostId: string;
      transport: 'local-proxy';
      expectedVersion: typeof APP_SERVER_PROTOCOL_VERSION;
      codexHome?: string;
      socketPath?: string;
      requiredCapabilities: readonly AppServerHostCapability[];
    }
  | {
      hostId: string;
      transport: 'remote-wss';
      endpoint: string;
      credentialRef: string;
      expectedVersion: typeof APP_SERVER_PROTOCOL_VERSION;
      caCertificatePath?: string;
      requiredCapabilities: readonly AppServerHostCapability[];
    };

interface HostRecord {
  config: NormalizedHost;
  summary: AppServerHostSummary;
  enabled: boolean;
  connections: Set<HostConnection>;
  daemon?: ChildProcess;
  managedSocketPath?: string;
}

interface Subscription {
  method: string;
  params?: AppServerJson;
  result: AppServerJson;
}

interface ProviderFailure {
  observedBytes?: unknown;
  limitBytes?: unknown;
  code?: unknown;
  providerCode?: unknown;
  ambiguous?: unknown;
}

const HOST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CREDENTIAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const LOCAL_KEYS = new Set([
  'hostId',
  'transport',
  'expectedVersion',
  'codexHome',
  'socketPath',
  'requiredCapabilities',
]);
const REMOTE_KEYS = new Set([
  'hostId',
  'transport',
  'endpoint',
  'credentialRef',
  'expectedVersion',
  'caCertificatePath',
  'requiredCapabilities',
]);

function hostError(
  code: AppServerHostErrorCode,
  message: string,
  details: ConstructorParameters<typeof AppServerHostError>[2] = {},
): AppServerHostError {
  return new AppServerHostError(code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw hostError('INVALID_HOST', `Invalid host registry option: ${name}`);
  }
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateKeys(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
}

function capabilities(value: unknown): readonly AppServerHostCapability[] {
  if (value === undefined) return APP_SERVER_HOST_CAPABILITIES;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  const unique = [...new Set(value)].sort();
  if (
    unique.some(
      (item) =>
        !APP_SERVER_HOST_CAPABILITIES.includes(item as AppServerHostCapability),
    )
  ) {
    throw hostError(
      'CAPABILITY_MISMATCH',
      'App Server host capability mismatch',
    );
  }
  return unique as AppServerHostCapability[];
}

function normalize(input: AppServerHostInput): NormalizedHost {
  if (!isRecord(input) || !HOST_ID.test(String(input.hostId ?? ''))) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  if (input.expectedVersion !== APP_SERVER_PROTOCOL_VERSION) {
    throw hostError('VERSION_MISMATCH', 'App Server host version mismatch');
  }
  if (input.transport === 'local-proxy') {
    validateKeys(input, LOCAL_KEYS);
    if (input.codexHome !== undefined && !isAbsolute(input.codexHome)) {
      throw hostError('INVALID_HOST', 'Invalid App Server host');
    }
    if (input.socketPath !== undefined && !isAbsolute(input.socketPath)) {
      throw hostError('INVALID_HOST', 'Invalid App Server host');
    }
    return {
      hostId: input.hostId,
      transport: input.transport,
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      ...(input.codexHome === undefined ? {} : { codexHome: input.codexHome }),
      ...(input.socketPath === undefined
        ? {}
        : { socketPath: input.socketPath }),
      requiredCapabilities: capabilities(input.requiredCapabilities),
    };
  }
  if (input.transport !== 'remote-wss') {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  validateKeys(input, REMOTE_KEYS);
  if (!CREDENTIAL_REF.test(String(input.credentialRef ?? ''))) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  if (
    endpoint.protocol !== 'wss:' ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  if (
    input.caCertificatePath !== undefined &&
    !isAbsolute(input.caCertificatePath)
  ) {
    throw hostError('INVALID_HOST', 'Invalid App Server host');
  }
  return {
    hostId: input.hostId,
    transport: input.transport,
    endpoint: endpoint.toString(),
    credentialRef: input.credentialRef,
    expectedVersion: APP_SERVER_PROTOCOL_VERSION,
    ...(input.caCertificatePath === undefined
      ? {}
      : { caCertificatePath: input.caCertificatePath }),
    requiredCapabilities: capabilities(input.requiredCapabilities),
  };
}

function summary(
  config: NormalizedHost,
  enabled: boolean,
): AppServerHostSummary {
  return Object.freeze({
    hostId: config.hostId,
    transport: config.transport,
    endpoint:
      config.transport === 'local-proxy'
        ? config.socketPath
          ? `unix://${config.socketPath}`
          : 'unix://'
        : config.endpoint,
    expectedVersion: config.expectedVersion,
    enabled,
    capabilities: APP_SERVER_HOST_CAPABILITIES,
  });
}

function providerFailure(value: unknown): ProviderFailure {
  return isRecord(value) ? value : {};
}

class HostConnection implements AppServerHostConnection {
  private client!: AppServerClient;
  private readonly subscriptions = new Map<string, Subscription>();
  private reconnectAttempts = 0;
  private closed = false;

  constructor(
    private readonly record: HostRecord,
    private readonly options: ResolvedOptions,
    private readonly prepareLocal: () => Promise<string | undefined>,
    private readonly onClose: () => void,
  ) {}

  get hostId(): string {
    return this.record.config.hostId;
  }

  get diagnostics(): AppServerClientDiagnostics {
    return this.client.diagnostics;
  }

  async open(): Promise<void> {
    this.client = await this.connectOnce();
  }

  private async connectOnce(): Promise<AppServerClient> {
    const config = this.record.config;
    try {
      if (config.transport === 'local-proxy') {
        const env = {
          ...process.env,
          ...(config.codexHome === undefined
            ? {}
            : { CODEX_HOME: config.codexHome }),
        };
        const socketPath = await this.prepareLocal();
        const managed = !config.socketPath;
        return await this.options.connectAppServer({
          command: managed ? this.options.bunCommand : 'codex',
          expectedVersion: config.expectedVersion,
          clientInfo: this.options.clientInfo,
          maxMessageBytes: this.options.maxMessageBytes,
          env,
          ...(managed
            ? {
                versionArgs: [
                  this.options.unixBridgePath,
                  socketPath ?? '',
                  '--version',
                  `--max-message-bytes=${this.options.maxMessageBytes}`,
                ],
                serverArgs: [
                  this.options.unixBridgePath,
                  socketPath ?? '',
                  'connect',
                  `--max-message-bytes=${this.options.maxMessageBytes}`,
                ],
              }
            : {
                serverArgs: [
                  'app-server',
                  'proxy',
                  ...(socketPath ? ['--sock', socketPath] : []),
                ],
              }),
        });
      }

      const token = await this.options.resolveCredential(config.credentialRef);
      if (!nonEmpty(token) || /[\r\n]/.test(token)) {
        throw hostError(
          'HOST_AUTHENTICATION_FAILED',
          'App Server host authentication failed',
          { hostId: config.hostId },
        );
      }
      const bridgeArgs = [
        this.options.bridgePath,
        config.endpoint,
        config.caCertificatePath ?? '-',
      ];
      return await this.options.connectAppServer({
        command: this.options.bunCommand,
        expectedVersion: config.expectedVersion,
        clientInfo: this.options.clientInfo,
        maxMessageBytes: this.options.maxMessageBytes,
        env: { ...process.env, CAS02_REMOTE_TOKEN: token },
        versionArgs: [
          ...bridgeArgs,
          '--version',
          `--max-message-bytes=${this.options.maxMessageBytes}`,
        ],
        serverArgs: [
          ...bridgeArgs,
          'connect',
          `--max-message-bytes=${this.options.maxMessageBytes}`,
        ],
      });
    } catch (cause) {
      if (cause instanceof AppServerHostError) throw cause;
      const failure = providerFailure(cause);
      throw hostError(
        config.transport === 'remote-wss' &&
          failure.code === 'VERSION_CHECK_FAILED'
          ? 'HOST_AUTHENTICATION_FAILED'
          : 'HOST_UNAVAILABLE',
        config.transport === 'remote-wss'
          ? 'App Server host authentication failed'
          : 'App Server host unavailable',
        { hostId: config.hostId },
      );
    }
  }

  async request<T extends AppServerJson = AppServerJson>(
    method: string,
    params?: AppServerJson,
    requestOptions?: AppServerRequestOptions,
  ): Promise<T> {
    this.assertOpen();
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.client.request<T>(method, params, requestOptions);
      } catch (cause) {
        const failure = providerFailure(cause);
        if (failure.code === 'MESSAGE_TOO_LARGE') {
          throw hostError(
            'MESSAGE_TOO_LARGE',
            'App Server message exceeds configured byte limit',
            {
              hostId: this.hostId,
              method,
              retryable: false,
              ...(typeof failure.observedBytes === 'number' &&
              Number.isSafeInteger(failure.observedBytes) &&
              failure.observedBytes > 0
                ? { observedBytes: failure.observedBytes }
                : {}),
              ...(typeof failure.limitBytes === 'number' &&
              Number.isSafeInteger(failure.limitBytes) &&
              failure.limitBytes > 0
                ? { limitBytes: failure.limitBytes }
                : {}),
            },
          );
        }
        if (
          failure.providerCode === -32_001 &&
          attempt < this.options.maxReconnectAttempts
        ) {
          await this.options.sleep(this.delay(attempt));
          continue;
        }
        if (failure.ambiguous === true) {
          throw hostError(
            'HOST_CONNECTION_LOST',
            'App Server host connection was lost',
            {
              ambiguous: true,
              hostId: this.hostId,
              method,
            },
          );
        }
        throw hostError(
          'HOST_REQUEST_FAILED',
          'App Server host request failed',
          {
            hostId: this.hostId,
            method,
            ...(typeof failure.providerCode === 'number'
              ? { providerCode: failure.providerCode }
              : {}),
          },
        );
      }
    }
  }

  messages(options?: {
    signal?: AbortSignal;
  }): AsyncIterable<AppServerInboundMessage> {
    this.assertOpen();
    return this.client.messages(options);
  }

  respond(
    id: AppServerRequestId,
    response:
      | { result: AppServerJson }
      | { error: { code: number; message: string } },
  ): Promise<void> {
    this.assertOpen();
    return this.client.respond(id, response);
  }

  startThread(params: AppServerThreadStart): Promise<AppServerThreadRef> {
    this.assertOpen();
    return this.client.startThread(params);
  }

  startTurn(params: AppServerTurnStart): Promise<AppServerTurnRef> {
    this.assertOpen();
    return this.client.startTurn(params);
  }

  interruptTurn(params: { threadId: string; turnId: string }): Promise<void> {
    this.assertOpen();
    return this.client.interruptTurn(params);
  }

  metrics(): AppServerClientMetrics {
    return this.client.metrics();
  }

  async subscribe<T extends AppServerJson = AppServerJson>(
    key: string,
    method: string,
    params?: AppServerJson,
  ): Promise<T> {
    if (!nonEmpty(key) || !nonEmpty(method)) {
      throw hostError('INVALID_HOST', 'Invalid App Server subscription');
    }
    const existing = this.subscriptions.get(key);
    if (existing) {
      if (
        existing.method !== method ||
        stable(existing.params) !== stable(params)
      ) {
        throw hostError(
          'SUBSCRIPTION_CONFLICT',
          'App Server subscription key conflict',
          { hostId: this.hostId },
        );
      }
      return existing.result as T;
    }
    const result = await this.request<T>(method, params);
    this.subscriptions.set(key, { method, params, result });
    return result;
  }

  async reconnect(): Promise<void> {
    this.assertOpen();
    await this.client.close();
    let lastFailure: unknown;
    for (
      let attempt = 0;
      attempt < this.options.maxReconnectAttempts;
      attempt += 1
    ) {
      this.reconnectAttempts += 1;
      await this.options.sleep(this.delay(attempt));
      let next: AppServerClient | undefined;
      try {
        next = await this.connectOnce();
        for (const subscription of this.subscriptions.values()) {
          subscription.result = await next.request(
            subscription.method,
            subscription.params,
          );
        }
        this.client = next;
        return;
      } catch (cause) {
        await next?.close();
        lastFailure = cause;
      }
    }
    throw hostError('HOST_UNAVAILABLE', 'App Server host unavailable', {
      hostId: this.hostId,
      ...(providerFailure(lastFailure).ambiguous === true
        ? { ambiguous: true }
        : {}),
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client.close();
    this.onClose();
  }

  hostMetrics(): {
    reconnectAttempts: number;
    subscriptions: number;
    closed: boolean;
  } {
    return {
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: this.subscriptions.size,
      closed: this.closed,
    };
  }

  private delay(attempt: number): number {
    const exponential = Math.min(
      this.options.reconnectBaseDelayMs * 2 ** attempt,
      this.options.reconnectMaxDelayMs,
    );
    return Math.round(exponential + exponential * 0.25 * this.options.random());
  }

  private assertOpen(): void {
    if (this.closed) {
      throw hostError('HOST_CLOSED', 'App Server host connection is closed', {
        hostId: this.hostId,
      });
    }
  }
}

interface ResolvedOptions {
  maxMessageBytes: number;
  connectAppServer: AppServerHostRegistryOptions['connectAppServer'];
  resolveCredential: AppServerHostRegistryOptions['resolveCredential'];
  bunCommand: string;
  bridgePath: string;
  unixBridgePath: string;
  clientInfo: AppServerClientOptions['clientInfo'];
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

function resolveOptions(
  options: AppServerHostRegistryOptions,
): ResolvedOptions {
  if (
    !isRecord(options) ||
    typeof options.connectAppServer !== 'function' ||
    typeof options.resolveCredential !== 'function'
  ) {
    throw hostError('INVALID_HOST', 'Invalid host registry options');
  }
  const sourceExtension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const maxMessageBytes = positiveInteger(
    options.maxMessageBytes ?? APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES,
    'maxMessageBytes',
  );
  if (maxMessageBytes > APP_SERVER_MAX_MESSAGE_BYTES) {
    throw hostError('INVALID_HOST', 'Invalid maxMessageBytes');
  }
  const bridgePath =
    options.bridgePath ??
    fileURLToPath(
      new URL(`./app-server-wss-bridge.${sourceExtension}`, import.meta.url),
    );
  const unixBridgePath =
    options.unixBridgePath ??
    fileURLToPath(
      new URL(`./app-server-unix-bridge.${sourceExtension}`, import.meta.url),
    );
  return {
    connectAppServer: options.connectAppServer,
    maxMessageBytes,
    resolveCredential: options.resolveCredential,
    bunCommand:
      options.bunCommand ?? (process.versions.bun ? process.execPath : 'bun'),
    bridgePath,
    unixBridgePath,
    clientInfo: {
      name: 'codex_control',
      title: 'Codex Control',
      version: APP_SERVER_PROTOCOL_VERSION,
    },
    maxReconnectAttempts: positiveInteger(
      options.maxReconnectAttempts ?? 3,
      'maxReconnectAttempts',
    ),
    reconnectBaseDelayMs: positiveInteger(
      options.reconnectBaseDelayMs ?? 100,
      'reconnectBaseDelayMs',
    ),
    reconnectMaxDelayMs: positiveInteger(
      options.reconnectMaxDelayMs ?? 2_000,
      'reconnectMaxDelayMs',
    ),
    random: options.random ?? Math.random,
    sleep:
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

export function createAppServerHostRegistry(
  inputOptions: AppServerHostRegistryOptions,
): AppServerHostRegistry {
  const options = resolveOptions(inputOptions);
  const records = new Map<string, HostRecord>();

  async function stopManagedDaemon(target: HostRecord): Promise<void> {
    const child = target.daemon;
    target.daemon = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              hostError('HOST_UNAVAILABLE', 'App Server host unavailable'),
            ),
          5_000,
        );
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    if (target.managedSocketPath) {
      await rm(target.managedSocketPath, { force: true });
    }
  }

  async function prepareLocal(target: HostRecord): Promise<string | undefined> {
    const config = target.config;
    if (config.transport !== 'local-proxy') return undefined;
    if (config.socketPath) return config.socketPath;
    if (target.daemon && target.daemon.exitCode === null) {
      return target.managedSocketPath;
    }
    const codexHome =
      config.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
    const socketPath = join(
      codexHome,
      'app-server-control',
      'app-server-control.sock',
    );
    await mkdir(dirname(socketPath), { recursive: true });
    await rm(socketPath, { force: true });
    const env = {
      ...process.env,
      ...(config.codexHome === undefined
        ? {}
        : { CODEX_HOME: config.codexHome }),
    };
    const child = spawn('codex', ['app-server', '--listen', 'unix://'], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr?.resume();
    target.daemon = child;
    target.managedSocketPath = socketPath;
    child.once('exit', () => {
      if (target.daemon === child) target.daemon = undefined;
    });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        await stat(socketPath);
        return socketPath;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    await stopManagedDaemon(target);
    throw hostError('HOST_UNAVAILABLE', 'App Server host unavailable', {
      hostId: config.hostId,
    });
  }

  function record(hostId: string): HostRecord {
    const value = records.get(hostId);
    if (!value) {
      throw hostError('HOST_NOT_FOUND', 'App Server host not found', {
        hostId,
      });
    }
    if (!value.enabled) {
      throw hostError('HOST_DISABLED', 'App Server host is disabled', {
        hostId,
      });
    }
    return value;
  }

  return {
    register(input) {
      const config = normalize(input);
      const existing = records.get(config.hostId);
      if (existing) {
        if (stable(existing.config) !== stable(config)) {
          throw hostError('HOST_CONFLICT', 'App Server host conflict', {
            hostId: config.hostId,
          });
        }
        return existing.summary;
      }
      const created: HostRecord = {
        config,
        summary: summary(config, true),
        enabled: true,
        connections: new Set(),
      };
      records.set(config.hostId, created);
      return created.summary;
    },

    read(hostId) {
      return records.get(hostId)?.summary;
    },

    async connect(hostId) {
      const target = record(hostId);
      const connection = new HostConnection(
        target,
        options,
        () => prepareLocal(target),
        () => target.connections.delete(connection),
      );
      await connection.open();
      target.connections.add(connection);
      return connection;
    },

    async health(hostId) {
      const target = record(hostId);
      const connection = new HostConnection(
        target,
        options,
        () => prepareLocal(target),
        () => undefined,
      );
      await connection.open();
      try {
        return {
          available: true,
          serverVersion: connection.diagnostics.serverVersion,
          capabilities: APP_SERVER_HOST_CAPABILITIES,
        };
      } finally {
        await connection.close();
      }
    },

    async restart(hostId) {
      const target = record(hostId);
      if (
        target.config.transport !== 'local-proxy' ||
        target.config.socketPath
      ) {
        throw hostError('HOST_UNAVAILABLE', 'App Server host is not managed', {
          hostId,
        });
      }
      await stopManagedDaemon(target);
      await prepareLocal(target);
    },

    async disable(hostId) {
      const target = records.get(hostId);
      if (!target) {
        throw hostError('HOST_NOT_FOUND', 'App Server host not found', {
          hostId,
        });
      }
      if (!target.enabled) return;
      target.enabled = false;
      target.summary = summary(target.config, false);
      await Promise.all(
        [...target.connections].map((connection) => connection.close()),
      );
      target.connections.clear();
      await stopManagedDaemon(target);
    },
  };
}
