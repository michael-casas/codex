import type { RuntimeVisibilityRepository } from '@codex/process';
import {
  RuntimeVisibilityError,
  createRuntimeVisibilityIngestor,
  createRuntimeVisibilityService,
} from '@codex/process';
import {
  createControlVisibilityProjector,
  type VisibilitySourceEvent,
} from './control-visibility.projector.js';

type ObserverFailure = {
  readonly code: string;
  readonly stage: 'listener' | 'reconcile';
  readonly cursor: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
};

// Only known connection failures are transient. Invalid data and unknown defects
// remain fail-closed; retrying them must not silently skip an immutable event.
function classify(error: unknown): Pick<ObserverFailure, 'code' | 'retryable'> {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (
    typeof code === 'string' &&
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'EAI_AGAIN',
      '08000',
      '08001',
      '08003',
      '08006',
      '57P01',
      '57P02',
      '57P03',
      'VISIBILITY_SOURCE_DISCONNECTED',
    ].includes(code)
  )
    return { code: 'VISIBILITY_SOURCE_UNAVAILABLE', retryable: true };
  return {
    code:
      code === 'VISIBILITY_EVENT_CONFLICT' ||
      code === 'VISIBILITY_EVENT_INVALID'
        ? code
        : 'VISIBILITY_OBSERVER_FAILED',
    retryable: false,
  };
}

export function createRuntimeVisibilityDaemon(
  repository: RuntimeVisibilityRepository,
  options: {
    readonly coalesceIntervalMs?: number;
    readonly maxCoalescedBytes?: number;
    readonly sourcePage?: (
      afterCursor: string,
    ) => Promise<readonly VisibilitySourceEvent[]>;
    readonly listenSource?: (
      onSequence: (sequence: string) => void,
      onError: (error: unknown) => void,
    ) => Promise<() => Promise<void>>;
  } = {},
) {
  const ingestor = createRuntimeVisibilityIngestor(repository, options);
  const service = createRuntimeVisibilityService(repository);
  let project = createControlVisibilityProjector();
  let cursor = '0';
  let failure: ObserverFailure | undefined;
  let lastFailure: ObserverFailure | undefined;
  let failureVersion = 0;
  let recoveryAttempts = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectSource = false;
  let closed = false;
  let started = false;
  let closeSource: (() => Promise<void>) | undefined;
  let writes = Promise.resolve();
  let draining = false;
  let dirty = false;
  let earliest: string | undefined;
  const resetProjection = () => {
    cursor = '0';
    project = createControlVisibilityProjector();
  };
  const reconcile = async (hint?: string) => {
    if (!options.sourcePage || closed) return;
    // Stateful display context must be rebuilt in source order on rewind. Reusing
    // its sequence guard hides changed identities and partially failed ingestion.
    if (hint && BigInt(hint) <= BigInt(cursor)) resetProjection();
    let after = cursor;
    while (!closed) {
      const events = await options.sourcePage(after);
      if (!events.length) return;
      for (const event of events) {
        if (
          !/^[1-9]\d*$/.test(event.sequence) ||
          BigInt(event.sequence) <= BigInt(after)
        )
          throw new Error('Invalid visibility source sequence.');
        for (const observation of project(event))
          await repository.ingest(observation);
        after = event.sequence;
        cursor = after;
      }
    }
  };
  const observerError = () =>
    new RuntimeVisibilityError(
      failure && !failure.retryable
        ? failure.code
        : 'VISIBILITY_OBSERVER_UNAVAILABLE',
      'Observation is unavailable; derived workflow state is not authoritative.',
    );
  const healthy = () => {
    if (failure || closed) throw observerError();
  };
  const recordFailure = (error: unknown, stage: ObserverFailure['stage']) => {
    if (closed) return;
    // A late connection callback cannot downgrade a permanent projection conflict.
    if (failure && !failure.retryable) return;
    if (!failure) recoveryAttempts = 0;
    failure = {
      ...classify(error),
      stage,
      cursor,
      occurredAt: new Date().toISOString(),
    };
    lastFailure = failure;
    // Retain incident-attributed, safe metadata in the daemon log, including after
    // recovery. Never log the original exception or provider/source payload.
    console.error(
      JSON.stringify({
        event: 'visibility.observer.failure',
        ...failure,
        recoveryAttempt: recoveryAttempts,
      }),
    );
    failureVersion++;
    if (stage === 'listener') reconnectSource = true;
    armRecovery();
  };
  const connectSource = async () => {
    if (!options.listenSource) return;
    closeSource = await options.listenSource(
      (sequence) => {
        void schedule(sequence).catch(() => undefined);
      },
      (error) => recordFailure(error, 'listener'),
    );
  };
  const recover = async () => {
    if (closed || !failure?.retryable || recoveryAttempts >= 3) return;
    recoveryAttempts++;
    const version = failureVersion;
    let stage: ObserverFailure['stage'] = 'listener';
    try {
      if (reconnectSource) {
        const close = closeSource;
        closeSource = undefined;
        await close?.();
        if (closed) return;
        await connectSource();
      }
      stage = 'reconcile';
      resetProjection();
      do {
        dirty = false;
        const hint = earliest;
        earliest = undefined;
        await reconcile(hint);
      } while (dirty && !closed && failureVersion === version);
      if (!closed && failureVersion === version) {
        failure = undefined;
        reconnectSource = false;
      }
    } catch (error) {
      recordFailure(error, stage);
    } finally {
      armRecovery();
    }
  };
  function armRecovery() {
    if (closed || !failure?.retryable || recoveryAttempts >= 3 || recoveryTimer)
      return;
    recoveryTimer = setTimeout(
      () => {
        recoveryTimer = undefined;
        writes = writes.catch(() => undefined).then(recover);
      },
      1000 * 2 ** recoveryAttempts,
    );
    recoveryTimer.unref?.();
  }
  const schedule = (hint?: string) => {
    if (closed) return writes;
    if (hint !== undefined && !/^[1-9]\d*$/.test(hint)) {
      recordFailure(new Error('Invalid visibility notification.'), 'listener');
      return writes;
    }
    dirty = true;
    if (hint && (!earliest || BigInt(hint) < BigInt(earliest))) earliest = hint;
    if (draining || failure) return writes;
    draining = true;
    writes = (async () => {
      while (dirty && !closed && !failure) {
        dirty = false;
        const after = earliest;
        earliest = undefined;
        await reconcile(after);
      }
    })()
      .catch((error) => {
        recordFailure(error, 'reconcile');
        throw observerError();
      })
      .finally(() => {
        draining = false;
      });
    void writes.catch(() => undefined);
    return writes;
  };
  return {
    ...service,
    diagnostics: () => ({
      state: closed
        ? 'stopped'
        : failure
          ? !failure.retryable || recoveryAttempts >= 3
            ? 'failed'
            : 'recovering'
          : 'healthy',
      cursor,
      recoveryAttempts,
      ...(lastFailure ? { lastFailure: { ...lastFailure } } : {}),
    }),
    async snapshot(query?: Parameters<typeof service.snapshot>[0]) {
      healthy();
      const version = failureVersion;
      const result = await service.snapshot(query);
      healthy();
      if (failureVersion !== version) throw observerError();
      return result;
    },
    async wait(
      query: Parameters<typeof service.wait>[0],
      signal?: AbortSignal,
    ) {
      healthy();
      const version = failureVersion;
      const result = await service.wait(query, signal);
      healthy();
      if (failureVersion !== version) throw observerError();
      return result;
    },
    observe: ingestor.observe,
    flush: ingestor.flush,
    async start() {
      if (started && !closed) return;
      started = true;
      closed = false;
      failure = undefined;
      recoveryAttempts = 0;
      dirty = false;
      earliest = undefined;
      resetProjection();
      try {
        reconnectSource = true;
        await connectSource();
        reconnectSource = false;
      } catch (error) {
        recordFailure(error, 'listener');
      }
      try {
        if (!failure) await schedule();
        const startupFailure = failure as ObserverFailure | undefined;
        if (startupFailure && !startupFailure.retryable) throw observerError();
      } catch (error) {
        if ((failure as ObserverFailure | undefined)?.retryable) return;
        await closeSource?.();
        closeSource = undefined;
        throw error;
      }
    },
    async stop() {
      closed = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      await writes.catch(() => undefined);
      await closeSource?.();
      closeSource = undefined;
      await ingestor.stop();
    },
  };
}
