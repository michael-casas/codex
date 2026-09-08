export const APP_SERVER_PROTOCOL_VERSION = '0.151.0' as const;
export const APP_SERVER_DEFAULT_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export const APP_SERVER_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

export type AppServerJson =
  | null
  | boolean
  | number
  | string
  | AppServerJson[]
  | { [key: string]: AppServerJson };

export type AppServerRequestId = number | string;

export type AppServerClientErrorCode =
  | 'ALREADY_INITIALIZED'
  | 'BACKPRESSURE'
  | 'CAPACITY_EXCEEDED'
  | 'CLIENT_CLOSED'
  | 'CONNECTION_CLOSED'
  | 'FEED_ALREADY_ACTIVE'
  | 'INVALID_OPTIONS'
  | 'INVALID_REQUEST'
  | 'MALFORMED_MESSAGE'
  | 'MESSAGE_TOO_LARGE'
  | 'NOT_INITIALIZED'
  | 'REQUEST_ABORTED'
  | 'REQUEST_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'UNMATCHED_RESPONSE'
  | 'VERSION_CHECK_FAILED'
  | 'VERSION_MISMATCH';

export class AppServerClientError extends Error {
  override readonly name = 'AppServerClientError';
  readonly ambiguous?: boolean;
  readonly method?: string;
  readonly providerCode?: number;
  readonly expectedVersion?: string;
  readonly actualVersion?: string;
  readonly observedBytes?: number;
  readonly limitBytes?: number;
  readonly retryable?: boolean;

  constructor(
    readonly code: AppServerClientErrorCode,
    message: string,
    readonly details: {
      ambiguous?: boolean;
      method?: string;
      providerCode?: number;
      expectedVersion?: string;
      actualVersion?: string;
      observedBytes?: number;
      limitBytes?: number;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.ambiguous = details.ambiguous;
    this.method = details.method;
    this.providerCode = details.providerCode;
    this.expectedVersion = details.expectedVersion;
    this.actualVersion = details.actualVersion;
    this.observedBytes = details.observedBytes;
    this.limitBytes = details.limitBytes;
    this.retryable = details.retryable;
  }
}

export type AppServerInboundMessage =
  | {
      kind: 'notification';
      method: string;
      params: AppServerJson;
    }
  | {
      kind: 'server-request';
      id: AppServerRequestId;
      method: string;
      params: AppServerJson;
    };

export interface AppServerClientOptions {
  command?: string;
  versionArgs?: readonly string[];
  serverArgs?: readonly string[];
  expectedVersion: string;
  clientInfo: {
    name: string;
    title: string;
    version: string;
  };
  capabilities?: AppServerJson;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBufferedMessages?: number;
  maxCanceledResponses?: number;
  maxMessageBytes?: number;
  maxPendingRequests?: number;
  requestTimeoutMs?: number;
  closeTimeoutMs?: number;
}

export interface AppServerRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AppServerThreadStart {
  model: string;
  cwd: string;
  approvalPolicy: 'never' | 'onRequest' | 'untrusted';
  sandbox: 'readOnly' | 'workspaceWrite' | 'dangerFullAccess';
}

export interface AppServerThreadRef {
  threadId: string;
  sessionId: string;
}

export interface AppServerTurnStart {
  threadId: string;
  input: Array<{ type: 'text'; text: string }>;
  model?: string;
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface AppServerTurnRef {
  turnId: string;
}

export interface AppServerClientMetrics {
  pendingRequests: number;
  bufferedMessages: number;
  canceledResponses: number;
  closed: boolean;
  childExited: boolean;
  failureCode?: AppServerClientErrorCode;
}

export interface AppServerClientDiagnostics {
  protocolVersion: typeof APP_SERVER_PROTOCOL_VERSION;
  serverVersion: string;
  platformFamily: string;
  platformOs: string;
}

export interface AppServerClient {
  readonly diagnostics: AppServerClientDiagnostics;
  request<T extends AppServerJson = AppServerJson>(
    method: string,
    params?: AppServerJson,
    options?: AppServerRequestOptions,
  ): Promise<T>;
  messages(options?: {
    signal?: AbortSignal;
  }): AsyncIterable<AppServerInboundMessage>;
  respond(
    id: AppServerRequestId,
    response:
      | { result: AppServerJson }
      | { error: { code: number; message: string } },
  ): Promise<void>;
  startThread(params: AppServerThreadStart): Promise<AppServerThreadRef>;
  startTurn(params: AppServerTurnStart): Promise<AppServerTurnRef>;
  interruptTurn(params: { threadId: string; turnId: string }): Promise<void>;
  metrics(): AppServerClientMetrics;
  close(): Promise<void>;
}
