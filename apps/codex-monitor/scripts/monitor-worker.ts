#!/usr/bin/env bun

import { waitForCondition } from './monitor-conditions.js';
import {
  appendEvent,
  readJson,
  targetFor,
  wakeText,
  writeJsonAtomic,
  type DurableMonitorState,
  type WakePayload,
} from './monitor-core.js';

function statePathFromArguments(argv: string[]): string {
  const index = argv.indexOf('--state');
  const value = argv[index + 1];
  if (index === -1 || !value) throw new Error('--state is required');
  return value;
}

const statePath = statePathFromArguments(process.argv.slice(2));
let state = readJson<DurableMonitorState>(statePath);
const controller = new AbortController();
let abortRequested = false;

function persist(patch: Partial<DurableMonitorState>): void {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  writeJsonAtomic(statePath, state);
}

function log(event: string, details: Record<string, unknown> = {}): void {
  appendEvent(state.logPath, event, { handleId: state.id, ...details });
}

function requestAbort(signal: NodeJS.Signals): void {
  if (abortRequested) return;
  abortRequested = true;
  log('monitor.abort.requested', { signal });
  controller.abort();
}

process.on('SIGINT', () => requestAbort('SIGINT'));
process.on('SIGTERM', () => requestAbort('SIGTERM'));

async function dispatchWake(payload: WakePayload): Promise<void> {
  const content = wakeText(payload);
  if (state.wakeMode === 'log-only') {
    persist({
      wake: {
        ...state.wake,
        status: 'completed',
        completedAt: new Date().toISOString(),
        mode: 'log-only',
      },
    });
    log('monitor.wake.completed', { mode: 'log-only' });
    return;
  }
  if (state.modelAffinity !== 'inherit') {
    throw new Error(
      'monitor model affinity must be inherit; explicit model overrides are forbidden',
    );
  }
  persist({
    wake: {
      ...state.wake,
      status: 'awaiting_host_dispatch',
      readyAt: new Date().toISOString(),
      backend: 'desktop-heartbeat',
      content,
    },
  });
  log('monitor.wake.awaiting_host_dispatch', {
    backend: 'desktop-heartbeat',
    headline: 'MONITOR EVENT',
  });
}

async function main(): Promise<void> {
  if (state.state !== 'armed') {
    throw new Error(`monitor cannot start from state ${state.state}`);
  }
  persist({
    state: 'active',
    activatedAt: new Date().toISOString(),
    workerPid: process.pid,
  });
  log('monitor.active', { condition: state.request.condition });

  const conditionPromise = waitForCondition(
    state.request.condition,
    state.request.interval_seconds * 1_000,
    controller.signal,
    (observation) =>
      log('monitor.condition.observed', { met: observation.met }),
  );
  let timeoutTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{ type: 'timeout' }>((resolveTimeout) => {
    timeoutTimer = setTimeout(
      () => resolveTimeout({ type: 'timeout' }),
      state.request.timeout_seconds * 1_000,
    );
  });

  let terminal: { state: string; payload: WakePayload };
  try {
    const result = await Promise.race([
      conditionPromise.then((details) => ({ type: 'met' as const, details })),
      timeoutPromise,
    ]);
    if (result.type === 'timeout') {
      controller.abort();
      await conditionPromise.catch(() => undefined);
      const soft = state.request.on_timeout === 'exit_zero_with_timeout_marker';
      terminal = {
        state: 'timed_out',
        payload: {
          handleId: state.id,
          outcome: 'timed_out',
          status: 'timeout',
          conditionKind: state.request.condition.kind,
          target: targetFor(state.request.condition),
          memo: state.request.memo,
          exitCode: soft ? 0 : 1,
          stdout: `${soft ? 'TIMEOUT_MARKER' : 'TIMEOUT'} — ${state.request.memo}`,
          hasTimeoutMarker: true,
        },
      };
    } else {
      terminal = {
        state: 'met',
        payload: {
          handleId: state.id,
          outcome: 'met',
          status: 'completed',
          conditionKind: state.request.condition.kind,
          target: targetFor(state.request.condition, result.details),
          memo: state.request.memo,
          exitCode: 0,
          ...(typeof result.details.stdout === 'string'
            ? { stdout: result.details.stdout }
            : {}),
          ...(typeof result.details.stderr === 'string'
            ? { stderr: result.details.stderr }
            : {}),
        },
      };
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError' &&
      abortRequested
    ) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      persist({
        state: 'aborted',
        terminalAt: new Date().toISOString(),
        wake: { status: 'suppressed' },
      });
      log('monitor.aborted');
      log('monitor.worker.exiting', {
        exitCode: 0,
        tmuxSession: state.tmuxSession,
      });
      return;
    }
    terminal = {
      state: 'error',
      payload: {
        handleId: state.id,
        outcome: 'error',
        status: 'failed',
        conditionKind: state.request.condition.kind,
        target: targetFor(state.request.condition),
        memo: state.request.memo,
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }

  persist({
    state: terminal.state,
    terminalAt: new Date().toISOString(),
    payload: terminal.payload,
  });
  log('monitor.terminal', {
    outcome: terminal.payload.outcome,
    status: terminal.payload.status,
  });
  try {
    await dispatchWake(terminal.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    persist({
      wake: {
        ...state.wake,
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: message,
      },
    });
    log('monitor.wake.failed', { error: message });
    log('monitor.worker.exiting', {
      exitCode: 1,
      tmuxSession: state.tmuxSession,
    });
    process.exitCode = 1;
    return;
  }
  log('monitor.worker.exiting', {
    exitCode: terminal.payload.exitCode,
    tmuxSession: state.tmuxSession,
  });
  process.exitCode = terminal.payload.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    persist({
      state: 'error',
      terminalAt: new Date().toISOString(),
      wake: { status: 'failed', error: message },
    });
    log('monitor.worker.failed', { error: message });
  } catch {
    // The original error remains the useful failure when state persistence is unavailable.
  }
  try {
    log('monitor.worker.exiting', {
      exitCode: 1,
      tmuxSession: state.tmuxSession,
    });
  } catch {
    // State may be unreadable; stderr still reports the original failure.
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
