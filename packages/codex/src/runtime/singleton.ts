import { createHash } from 'node:crypto';

import { createCodexSdkAdapter } from './adapter.js';
import type {
  CodexAdapter,
  CodexAdapterFactory,
  CodexEvent,
  CodexHost,
  CodexHostConfig,
  CodexHostDiagnostics,
  CodexHostMetrics,
  CodexOperationObservation,
  CodexSafeRequestedOptions,
  CodexThreadRequest,
  CodexTurnResult,
  CodexUsage,
} from './types.js';
import { attestCodexTurnResult } from './attestation.js';

type FingerprintValue =
  | boolean
  | number
  | string
  | null
  | FingerprintValue[]
  | { [key: string]: FingerprintValue };

function canonical(value: FingerprintValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
    .join(',')}}`;
}

function snapshotValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => snapshotValue(item))) as T;
  }
  if (typeof value !== 'object' || value === null) return value;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, snapshotValue(child)]),
    ),
  ) as T;
}

function snapshotConfig(config: CodexHostConfig): CodexHostConfig {
  return snapshotValue(config);
}

function sameAdmissionValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameAdmissionValue(item, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        sameAdmissionValue(leftRecord[key], rightRecord[key]),
    )
  );
}

function createFingerprint(config: CodexHostConfig): `sha256:${string}` {
  const fingerprintInput: FingerprintValue = {
    ...(config.codexPathOverride !== undefined
      ? { codexPathOverride: config.codexPathOverride }
      : {}),
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
  };
  return `sha256:${createHash('sha256')
    .update(canonical(fingerprintInput))
    .digest('hex')}`;
}

function createDiagnostics(
  config: CodexHostConfig,
  fingerprint: `sha256:${string}`,
): CodexHostDiagnostics {
  return Object.freeze({
    fingerprint,
    envKeys: Object.freeze(Object.keys(config.env ?? {}).sort()),
    sdkVersion: '0.147.0',
  });
}

function safeRequestedOptions(
  request: CodexThreadRequest,
): CodexSafeRequestedOptions {
  return {
    ...(request.model ? { model: request.model } : {}),
    ...(request.sandbox ? { sandbox: request.sandbox } : {}),
    ...(request.approval ? { approval: request.approval } : {}),
    ...(request.reasoningEffort
      ? { reasoningEffort: request.reasoningEffort }
      : {}),
    ...(request.networkAccessEnabled === undefined
      ? {}
      : { networkAccessEnabled: request.networkAccessEnabled }),
    ...(request.webSearch ? { webSearch: request.webSearch } : {}),
    ...(request.skipGitRepoCheck === undefined
      ? {}
      : { skipGitRepoCheck: request.skipGitRepoCheck }),
    workingDirectorySet: request.workingDirectory !== undefined,
    additionalDirectoryCount: request.additionalDirectories?.length ?? 0,
    hasOutputSchema: request.outputSchema !== undefined,
    signalSet: request.signal !== undefined,
  };
}

function uniqueEventTypes(events: CodexEvent[]): CodexEvent['type'][] {
  return [...new Set(events.map((event) => event.type))];
}

function aborted(request: CodexThreadRequest, error?: unknown): boolean {
  if (request.signal?.aborted) return true;
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'The operation was aborted')
  );
}

class RuntimeHost implements CodexHost {
  readonly diagnostics: CodexHostDiagnostics;
  readonly #authorityFingerprint: `sha256:${string}`;
  readonly #admittedConfig: CodexHostConfig;
  readonly #admittedFactory: CodexAdapterFactory;
  private activeOperations = 0;
  private closing = false;
  private closePromise: Promise<void> | undefined;
  private readonly drainWaiters = new Set<() => void>();
  private readonly threadTails = new Map<string, Promise<void>>();
  private readonly observer: CodexHostConfig['observe'];

  constructor(
    config: CodexHostConfig,
    private readonly adapter: CodexAdapter,
    fingerprint: `sha256:${string}`,
    factory: CodexAdapterFactory,
  ) {
    this.#authorityFingerprint = fingerprint;
    this.#admittedConfig = config;
    this.#admittedFactory = factory;
    this.diagnostics = createDiagnostics(config, fingerprint);
    this.observer = config.observe;
  }

  admits(config: CodexHostConfig, factory: CodexAdapterFactory): boolean {
    return (
      Object.is(this.#admittedFactory, factory) &&
      sameAdmissionValue(this.#admittedConfig, config)
    );
  }

  private observe(
    operation: CodexOperationObservation['operation'],
    outcome: CodexOperationObservation['outcome'],
    startedAt: number,
    request: CodexThreadRequest,
    events: CodexEvent[],
    usage: CodexUsage | null,
    threadId?: string,
    errorClassification?: CodexOperationObservation['errorClassification'],
  ): void {
    if (!this.observer) return;
    const requested = safeRequestedOptions(request);
    const observation: CodexOperationObservation = {
      operation,
      outcome,
      durationMs: Math.max(0, Date.now() - startedAt),
      ...(threadId ? { threadId } : {}),
      requested,
      effective: { ...requested },
      eventTypes: uniqueEventTypes(events),
      usage,
      ...(errorClassification ? { errorClassification } : {}),
      fingerprint: this.#authorityFingerprint,
      sdkVersion: this.diagnostics.sdkVersion,
    };
    try {
      this.observer(Object.freeze(observation));
    } catch {
      // Observation is best-effort and may not alter operation semantics.
    }
  }

  private acquire(): () => void {
    if (this.closing) throw new Error('CODEX_HOST_CLOSING');
    this.activeOperations += 1;
    let released = false;
    return () => {
      if (released) throw new Error('CODEX_OPERATION_RELEASED_TWICE');
      released = true;
      this.activeOperations -= 1;
      if (this.activeOperations === 0) {
        for (const waiter of this.drainWaiters) waiter();
        this.drainWaiters.clear();
      }
    };
  }

  private async acquireThreadLock(threadId: string): Promise<() => void> {
    const previous = this.threadTails.get(threadId) ?? Promise.resolve();
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const tail = previous.then(() => gate);
    this.threadTails.set(threadId, tail);
    await previous;
    let released = false;
    return () => {
      if (released) throw new Error('CODEX_THREAD_LOCK_RELEASED_TWICE');
      released = true;
      unlock();
      if (this.threadTails.get(threadId) === tail)
        this.threadTails.delete(threadId);
    };
  }

  private async serialize<T>(
    threadId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const unlock = await this.acquireThreadLock(threadId);
    try {
      return await operation();
    } finally {
      unlock();
    }
  }

  private execute(request: CodexThreadRequest): Promise<CodexTurnResult> {
    const thread = request.threadId
      ? this.adapter.resumeThread(request.threadId, request)
      : this.adapter.startThread(request);
    return thread.run(request);
  }

  async runTurn(request: CodexThreadRequest): Promise<CodexTurnResult> {
    const startedAt = Date.now();
    const release = this.acquire();
    try {
      const result = request.threadId
        ? await this.serialize(request.threadId, () => this.execute(request))
        : await this.execute(request);
      this.observe(
        'run',
        'completed',
        startedAt,
        request,
        result.events,
        result.usage,
        result.threadId,
      );
      return attestCodexTurnResult(result);
    } catch (error) {
      const wasAborted = aborted(request, error);
      this.observe(
        'run',
        wasAborted ? 'aborted' : 'failed',
        startedAt,
        request,
        [],
        null,
        request.threadId,
        wasAborted ? 'aborted' : 'adapter-error',
      );
      throw error;
    } finally {
      release();
    }
  }

  async *streamTurn(request: CodexThreadRequest): AsyncGenerator<CodexEvent> {
    const startedAt = Date.now();
    const events: CodexEvent[] = [];
    let usage: CodexUsage | null = null;
    let threadId = request.threadId;
    let streamCompleted = false;
    let streamFailed = false;
    let observationEmitted = false;
    const release = this.acquire();
    try {
      const consume = async function* (adapter: CodexAdapter) {
        const thread = request.threadId
          ? adapter.resumeThread(request.threadId, request)
          : adapter.startThread(request);
        threadId = thread.id ?? threadId;
        for await (const event of thread.stream(request)) {
          events.push(event);
          threadId = event.threadId ?? threadId;
          usage = event.usage ?? usage;
          if (event.type === 'turn.failed' || event.type === 'error') {
            streamFailed = true;
          }
          yield event;
        }
      };
      if (!request.threadId) {
        yield* consume(this.adapter);
      } else {
        const unlock = await this.acquireThreadLock(request.threadId);
        try {
          yield* consume(this.adapter);
        } finally {
          unlock();
        }
      }
      streamCompleted = true;
    } catch (error) {
      const wasAborted = aborted(request, error);
      this.observe(
        'stream',
        wasAborted ? 'aborted' : 'failed',
        startedAt,
        request,
        events,
        usage,
        threadId,
        wasAborted ? 'aborted' : 'adapter-error',
      );
      observationEmitted = true;
      throw error;
    } finally {
      if (!observationEmitted) {
        const wasAborted = aborted(request);
        this.observe(
          'stream',
          wasAborted
            ? 'aborted'
            : streamFailed
              ? 'failed'
              : streamCompleted
                ? 'completed'
                : 'consumer-returned',
          startedAt,
          request,
          events,
          usage,
          threadId,
          wasAborted ? 'aborted' : streamFailed ? 'adapter-error' : undefined,
        );
      }
      release();
    }
  }

  metrics(): CodexHostMetrics {
    return {
      activeOperations: this.activeOperations,
      threadLocks: this.threadTails.size,
      closing: this.closing,
    };
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise =
      this.activeOperations === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => this.drainWaiters.add(resolve));
    return this.closePromise;
  }

  reset(): void {
    if (this.activeOperations !== 0) throw new Error('CODEX_HOST_ACTIVE');
    this.closing = true;
    this.threadTails.clear();
  }
}

let singleton: RuntimeHost | undefined;

export function initializeCodexHost(
  config: CodexHostConfig,
  factory: CodexAdapterFactory = createCodexSdkAdapter,
): CodexHost {
  const admitted = snapshotConfig(config);
  const requestedFingerprint = createFingerprint(admitted);
  if (singleton) {
    if (singleton.metrics().closing) throw new Error('CODEX_HOST_CLOSING');
    if (!singleton.admits(admitted, factory)) {
      throw new Error('CODEX_HOST_CONFLICT');
    }
    return singleton;
  }
  singleton = new RuntimeHost(
    admitted,
    factory(admitted),
    requestedFingerprint,
    factory,
  );
  return singleton;
}

export async function shutdownCodexHost(): Promise<void> {
  const host = singleton;
  if (!host) return;
  await host.close();
  if (singleton === host) singleton = undefined;
}

export function resetCodexHostForTests(): void {
  if (!singleton) return;
  singleton.reset();
  singleton = undefined;
}
