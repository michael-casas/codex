import type { RuntimeVisibilityRepository } from '@codex/process';
import {
  createRuntimeVisibilityIngestor,
  createRuntimeVisibilityService,
} from '@codex/process';
import {
  createControlVisibilityProjector,
  type VisibilitySourceEvent,
} from './control-visibility.projector.js';

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
  let failure: unknown;
  let closed = false;
  let closeSource: (() => Promise<void>) | undefined;
  let writes = Promise.resolve();
  let draining = false;
  let dirty = false;
  let earliest: string | undefined;
  const reconcile = async (hint?: string) => {
    if (!options.sourcePage || closed) return;
    // NOTIFY can arrive after a later transaction committed; rewind its page so
    // a lower sequence is not lost. Immutable event IDs make repeats harmless.
    let after =
      hint && BigInt(hint) <= BigInt(cursor)
        ? (BigInt(hint) - 1n).toString()
        : cursor;
    while (!closed) {
      const events = await options.sourcePage(after);
      if (!events.length) return;
      for (const event of events)
        for (const observation of project(event))
          await repository.ingest(observation);
      after = events[events.length - 1].sequence;
      if (BigInt(after) > BigInt(cursor)) cursor = after;
    }
  };
  const schedule = (hint?: string) => {
    if (closed || failure) return writes;
    dirty = true;
    if (hint && (!earliest || BigInt(hint) < BigInt(earliest))) earliest = hint;
    if (draining) return writes;
    draining = true;
    writes = (async () => {
      while (dirty && !closed) {
        dirty = false;
        const after = earliest;
        earliest = undefined;
        await reconcile(after);
      }
    })().finally(() => {
      draining = false;
    });
    void writes.catch((error) => {
      failure = error;
    });
    return writes;
  };
  const healthy = () => {
    if (failure) throw failure;
  };
  return {
    ...service,
    snapshot: (query?: Parameters<typeof service.snapshot>[0]) => {
      healthy();
      return service.snapshot(query);
    },
    wait: (query: Parameters<typeof service.wait>[0], signal?: AbortSignal) => {
      healthy();
      return service.wait(query, signal);
    },
    observe: ingestor.observe,
    flush: ingestor.flush,
    async start() {
      if (closeSource) return;
      closed = false;
      failure = undefined;
      cursor = '0';
      project = createControlVisibilityProjector();
      if (options.listenSource)
        closeSource = await options.listenSource(
          (sequence) => {
            void schedule(sequence).catch(() => undefined);
          },
          (error) => {
            failure = error;
          },
        );
      try {
        await schedule();
      } catch (error) {
        await closeSource?.();
        closeSource = undefined;
        throw error;
      }
    },
    async stop() {
      closed = true;
      await closeSource?.();
      closeSource = undefined;
      await writes.catch(() => undefined);
      await ingestor.stop();
    },
  };
}
