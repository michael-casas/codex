export type OwnedJson =
  | null
  | boolean
  | number
  | string
  | OwnedJson[]
  | { [key: string]: OwnedJson };

export type CodexConfigValue =
  | boolean
  | number
  | string
  | CodexConfigValue[]
  | { [key: string]: CodexConfigValue };

export interface CodexHostConfig {
  codexPathOverride?: string;
  baseUrl?: string;
  apiKey?: string;
  config?: Record<string, CodexConfigValue>;
  env?: Record<string, string>;
  observe?: (observation: CodexOperationObservation) => void;
}

export interface CodexThreadRequest {
  prompt: string;
  threadId?: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  workingDirectory?: string;
  additionalDirectories?: string[];
  skipGitRepoCheck?: boolean;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  networkAccessEnabled?: boolean;
  webSearch?: 'disabled' | 'cached' | 'live';
  outputSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface CodexEvent {
  type:
    | 'thread.started'
    | 'turn.started'
    | 'turn.completed'
    | 'turn.failed'
    | 'item.started'
    | 'item.updated'
    | 'item.completed'
    | 'error';
  threadId?: string;
  item?: {
    id: string;
    type: string;
    text?: string;
    command?: string;
    status?: string;
    exitCode?: number;
  };
  usage?: CodexUsage;
  error?: string;
}

export interface CodexTurnResult {
  threadId: string;
  finalResponse: string;
  events: CodexEvent[];
  usage: CodexUsage | null;
}

export interface CodexSafeRequestedOptions {
  model?: string;
  sandbox?: CodexThreadRequest['sandbox'];
  approval?: CodexThreadRequest['approval'];
  reasoningEffort?: CodexThreadRequest['reasoningEffort'];
  networkAccessEnabled?: boolean;
  webSearch?: CodexThreadRequest['webSearch'];
  skipGitRepoCheck?: boolean;
  workingDirectorySet: boolean;
  additionalDirectoryCount: number;
  hasOutputSchema: boolean;
  signalSet: boolean;
}

export interface CodexOperationObservation {
  operation: 'run' | 'stream';
  outcome: 'completed' | 'failed' | 'aborted' | 'consumer-returned';
  durationMs: number;
  threadId?: string;
  requested: CodexSafeRequestedOptions;
  effective: CodexSafeRequestedOptions;
  eventTypes: CodexEvent['type'][];
  usage: CodexUsage | null;
  errorClassification?: 'adapter-error' | 'aborted';
  fingerprint: `sha256:${string}`;
  sdkVersion: '0.147.0';
}

export interface CodexAdapterThread {
  readonly id: string | null;
  run(request: CodexThreadRequest): Promise<CodexTurnResult>;
  stream(request: CodexThreadRequest): AsyncGenerator<CodexEvent>;
}

export interface CodexAdapter {
  startThread(request: CodexThreadRequest): CodexAdapterThread;
  resumeThread(
    threadId: string,
    request: CodexThreadRequest,
  ): CodexAdapterThread;
}

export type CodexAdapterFactory = (config: CodexHostConfig) => CodexAdapter;

export interface CodexHostDiagnostics {
  readonly fingerprint: `sha256:${string}`;
  readonly envKeys: readonly string[];
  readonly sdkVersion: '0.147.0';
}

export interface CodexHostMetrics {
  activeOperations: number;
  threadLocks: number;
  closing: boolean;
}

export interface CodexHost {
  readonly diagnostics: CodexHostDiagnostics;
  runTurn(request: CodexThreadRequest): Promise<CodexTurnResult>;
  streamTurn(request: CodexThreadRequest): AsyncGenerator<CodexEvent>;
  metrics(): CodexHostMetrics;
}
