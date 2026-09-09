import { describe, expect, it, vi } from 'vitest';
import { createRuntimeVisibilityDaemon } from '../runtime-visibility-daemon.js';
import {
  normalizeVisibilityObservation,
  type NormalizedVisibilityEvent,
} from '@codex/process';

const source = (sequence: number, kind = 'workflow.started') => ({
  sequence: String(sequence),
  eventId: `event-${sequence}`,
  streamId: 'workflow:workflow_fixture',
  occurredAt: '2026-09-09T00:00:00.000Z',
  kind,
  payload: { runId: 'workflow_fixture' },
});
function fixture() {
  const events = [source(1)];
  const stored = new Map<string, NormalizedVisibilityEvent>();
  let notify!: (sequence: string) => void, fail!: (error: unknown) => void;
  const ingest = vi.fn(async (event: NormalizedVisibilityEvent) => {
    const old = stored.get(event.eventId);
    if (old && JSON.stringify(old) !== JSON.stringify(event))
      throw Object.assign(Error('private conflict'), {
        code: 'VISIBILITY_EVENT_CONFLICT',
      });
    stored.set(event.eventId, event);
    return String(stored.size);
  });
  const close = vi.fn(async () => undefined);
  const page = vi.fn(async (after: string) =>
    events.filter((e) => BigInt(e.sequence) > BigInt(after)),
  );
  const listen = vi.fn(async (n: typeof notify, f: typeof fail) => {
    notify = n;
    fail = f;
    return close;
  });
  const daemon = createRuntimeVisibilityDaemon(
    {
      ingest,
      snapshot: async () => ({ cursor: String(stored.size), changed: true }),
      wait: async () => ({ cursor: String(stored.size), changed: false }),
    },
    { sourcePage: page, listenSource: listen },
  );
  return {
    daemon,
    events,
    stored,
    ingest,
    page,
    listen,
    close,
    notify: (n: string) => notify(n),
    fail: (e: unknown) => fail(e),
  };
}
const transient = () =>
  Object.assign(Error('secret connection string'), { code: 'ECONNRESET' });
const status = (daemon: ReturnType<typeof createRuntimeVisibilityDaemon>) =>
  (
    daemon as unknown as {
      diagnostics(): {
        state: string;
        lastFailure?: { code: string; stage: string };
        recoveryAttempts: number;
      };
    }
  ).diagnostics();

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] observer recovery', () => {
  it('OBS-L1-PARTIAL retries partial ingestion from clean projection without losing the failed observation', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.events.push(source(2, 'workflow.failed'));
      f.ingest.mockRejectedValueOnce(transient());
      f.notify('2');
      await vi.advanceTimersByTimeAsync(0);
      await expect(
        Promise.resolve().then(() => f.daemon.snapshot()),
      ).rejects.toMatchObject({ code: 'VISIBILITY_OBSERVER_UNAVAILABLE' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.stored.get('source:event-2')?.status).toBe('failed');
      expect(status(f.daemon)).toMatchObject({
        state: 'healthy',
        lastFailure: {
          code: 'VISIBILITY_SOURCE_UNAVAILABLE',
          stage: 'reconcile',
        },
      });
      expect(await f.daemon.snapshot()).toMatchObject({ cursor: '2' });
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('OBS-L1-LISTENER reconnects and catches missed terminal events with retained redacted diagnostics', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.fail(transient());
      f.events.push(source(2, 'workflow.failed'));
      await expect(
        Promise.resolve().then(() =>
          f.daemon.wait({ afterCursor: '1', waitMs: 0 }),
        ),
      ).rejects.toMatchObject({ code: 'VISIBILITY_OBSERVER_UNAVAILABLE' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(f.listen).toHaveBeenCalledTimes(2);
      expect(f.close).toHaveBeenCalledTimes(1);
      expect(f.stored.get('source:event-2')?.status).toBe('failed');
      expect(JSON.stringify(status(f.daemon))).not.toContain('secret');
      expect(status(f.daemon).state).toBe('healthy');
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('OBS-L1-BOUND exhausts three recovery attempts and remains unavailable', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.page.mockRejectedValue(transient());
      f.notify('2');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.page).toHaveBeenCalledTimes(6);
      expect(status(f.daemon)).toMatchObject({
        state: 'failed',
        recoveryAttempts: 3,
      }); // two initial pages, failed trigger, three retries
      await expect(
        Promise.resolve().then(() => f.daemon.snapshot()),
      ).rejects.toMatchObject({ code: 'VISIBILITY_OBSERVER_UNAVAILABLE' });
      const calls = f.page.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.page).toHaveBeenCalledTimes(calls);
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('OBS-L1-CONFLICT detects changed identities on rewind and never silently skips them', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.events[0] = source(1, 'workflow.failed');
      f.notify('1');
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(
        Promise.resolve().then(() => f.daemon.snapshot()),
      ).rejects.toMatchObject({ code: 'VISIBILITY_EVENT_CONFLICT' });
      expect(status(f.daemon)).toMatchObject({
        state: 'failed',
        recoveryAttempts: 0,
      });
      expect(f.stored.get('source:event-1')?.status).toBe('running');
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('OBS-L1-REWIND retains identical payloads through replay and late independent events', async () => {
    const f = fixture();
    try {
      await f.daemon.start();
      const before = JSON.stringify([...f.stored]);
      f.notify('1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(JSON.stringify([...f.stored])).toBe(before);
      const expected = normalizeVisibilityObservation({
        eventId: 'source:event-1',
        source: 'workflow',
        kind: 'workflow.started',
        occurredAt: source(1).occurredAt,
        workflowId: 'workflow_fixture',
        status: 'running',
        title: 'Workflow',
      });
      expect(f.stored.get('source:event-1')).toEqual(expected);
    } finally {
      await f.daemon.stop();
    }
  });
  it('OBS-L1-INVALID fails closed on invalid source sequence without retry', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.page.mockResolvedValue([{ ...source(2), sequence: 'not-a-sequence' }]);
      f.notify('2');
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(
        Promise.resolve().then(() => f.daemon.snapshot()),
      ).rejects.toMatchObject({ code: 'VISIBILITY_OBSERVER_FAILED' });
      expect(status(f.daemon)).toMatchObject({
        state: 'failed',
        recoveryAttempts: 0,
        lastFailure: { code: 'VISIBILITY_OBSERVER_FAILED' },
      });
      expect(f.stored.size).toBe(1);
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('OBS-L1-STOP cancels scheduled recovery and rejects stopped observer reads', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.fail(transient());
      await f.daemon.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.listen).toHaveBeenCalledTimes(1);
      expect(f.close).toHaveBeenCalledTimes(1);
      await expect(
        Promise.resolve().then(() => f.daemon.snapshot()),
      ).rejects.toMatchObject({ code: 'VISIBILITY_OBSERVER_UNAVAILABLE' });
    } finally {
      vi.useRealTimers();
    }
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] R5 bounded replay and primary diagnostics', () => {
  it('R5-L1-DUPLICATE does not reingest a verified duplicate in a long stream', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.events.push(...Array.from({ length: 2099 }, (_, i) => source(i + 2)));
    try {
      await f.daemon.start();
      const writes = f.ingest.mock.calls.length;
      f.notify('2099');
      await vi.advanceTimersByTimeAsync(0);
      expect(f.ingest.mock.calls.length).toBe(writes);
      expect(f.page.mock.calls.slice(2).every(([after]) => after !== '0')).toBe(
        true,
      );
      expect(status(f.daemon).state).toBe('healthy');
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it.each(['23514', '42501'])(
    'R5-L1-PERMANENT retains safe SQLSTATE %s and failing source without retry',
    async (code) => {
      vi.useFakeTimers();
      const log = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const f = fixture();
      try {
        await f.daemon.start();
        f.events.push(source(2));
        f.ingest.mockRejectedValueOnce(
          Object.assign(Error('private /Users/secret credentials'), { code }),
        );
        f.notify('2');
        await vi.advanceTimersByTimeAsync(60_000);
        expect(status(f.daemon)).toMatchObject({
          state: 'failed',
          recoveryAttempts: 0,
          lastFailure: {
            causeCode: code,
            errorClass: 'Error',
            stage: 'reconcile',
            cursor: '1',
            sourceCursor: '2',
          },
        });
        expect(JSON.stringify(log.mock.calls)).not.toMatch(
          /private|credentials|secret/,
        );
      } finally {
        await f.daemon.stop();
        log.mockRestore();
        vi.useRealTimers();
      }
    },
  );
  it.each(['53300', '40001', '40P01'])(
    'R5-L1-RESOURCE bounds recovery for transient %s',
    async (code) => {
      vi.useFakeTimers();
      const f = fixture();
      try {
        await f.daemon.start();
        f.page.mockRejectedValue(Object.assign(Error('private'), { code }));
        f.notify('2');
        await vi.advanceTimersByTimeAsync(60_000);
        expect(status(f.daemon)).toMatchObject({
          state: 'failed',
          recoveryAttempts: 3,
          lastFailure: { causeCode: code, retryable: true },
        });
        const calls = f.page.mock.calls.length;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(f.page.mock.calls.length).toBe(calls);
      } finally {
        await f.daemon.stop();
        vi.useRealTimers();
      }
    },
  );
  it('R5-L1-REDACT rejects arbitrary error code and class text', async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await f.daemon.start();
      f.fail({
        code: 'SECRET_TOKEN',
        name: 'PrivateProviderError',
        message: 'private',
      });
      expect(status(f.daemon)).toMatchObject({
        lastFailure: { causeCode: 'UNKNOWN', errorClass: 'UnknownError' },
      });
      expect(JSON.stringify(status(f.daemon))).not.toMatch(
        /SECRET|Private|private/,
      );
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] R5 locked reconciliation guarantees', () => {
  it('R5-L1-LATE reconciles an unseen lower sequence without dropping later history', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.events.push(source(3));
    try {
      await f.daemon.start();
      f.events.splice(1, 0, {
        ...source(2),
        streamId: 'workflow:workflow_late',
        payload: { runId: 'workflow_late' },
      });
      f.notify('2');
      await vi.advanceTimersByTimeAsync(0);
      expect(status(f.daemon).state).toBe('healthy');
      expect(f.stored.size).toBe(3);
      expect(f.stored.get('source:event-2')?.workflowId).toBe('workflow_late');
      expect(f.stored.has('source:event-3')).toBe(true);
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
  it('R5-L1-OLD detects an immutable conflict even beyond the bounded recent window', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.events.push(...Array.from({ length: 4200 }, (_, i) => source(i + 2)));
    try {
      await f.daemon.start();
      f.events[0] = source(1, 'workflow.failed');
      f.notify('1');
      await vi.advanceTimersByTimeAsync(0);
      expect(status(f.daemon)).toMatchObject({
        state: 'failed',
        lastFailure: { code: 'VISIBILITY_EVENT_CONFLICT' },
      });
      expect(f.stored.get('source:event-1')?.status).toBe('running');
    } finally {
      await f.daemon.stop();
      vi.useRealTimers();
    }
  });
});
