#!/usr/bin/env node

import { waitForCondition } from "./monitor-conditions.mjs";
import { appendEvent, readJson, targetFor, wakeText, writeJsonAtomic } from "./monitor-core.mjs";

function statePathFromArguments(argv) {
  const index = argv.indexOf("--state");
  if (index === -1 || !argv[index + 1]) throw new Error("--state is required");
  return argv[index + 1];
}

const statePath = statePathFromArguments(process.argv.slice(2));
let state = readJson(statePath);
const controller = new AbortController();
let abortRequested = false;

function persist(patch) {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  writeJsonAtomic(statePath, state);
}

function log(event, details = {}) {
  appendEvent(state.logPath, event, { handleId: state.id, ...details });
}

function requestAbort(signal) {
  if (abortRequested) return;
  abortRequested = true;
  log("monitor.abort.requested", { signal });
  controller.abort();
}

process.on("SIGINT", () => requestAbort("SIGINT"));
process.on("SIGTERM", () => requestAbort("SIGTERM"));

async function dispatchWake(payload) {
  const content = wakeText(payload);

  if (state.wakeMode === "log-only") {
    persist({ wake: { ...state.wake, status: "completed", completedAt: new Date().toISOString(), mode: "log-only" } });
    log("monitor.wake.completed", { mode: "log-only" });
    return;
  }

  if (state.modelAffinity !== "inherit") {
    throw new Error("monitor model affinity must be inherit; explicit model overrides are forbidden");
  }
  persist({
    wake: {
      ...state.wake,
      status: "awaiting_host_dispatch",
      readyAt: new Date().toISOString(),
      backend: "desktop-heartbeat",
      content,
    },
  });
  log("monitor.wake.awaiting_host_dispatch", {
    backend: "desktop-heartbeat",
    headline: "MONITOR EVENT",
  });
}

async function main() {
  if (state.state !== "armed") throw new Error(`monitor cannot start from state ${state.state}`);
  persist({ state: "active", activatedAt: new Date().toISOString(), workerPid: process.pid });
  log("monitor.active", { condition: state.request.condition });

  const conditionPromise = waitForCondition(
    state.request.condition,
    state.request.interval_seconds * 1_000,
    controller.signal,
    (observation) => log("monitor.condition.observed", { met: Boolean(observation?.met) }),
  );
  let timeoutTimer;
  const timeoutPromise = new Promise((resolveTimeout) => {
    timeoutTimer = setTimeout(() => resolveTimeout({ type: "timeout" }), state.request.timeout_seconds * 1_000);
  });

  let terminal;
  try {
    const result = await Promise.race([
      conditionPromise.then((details) => ({ type: "met", details })),
      timeoutPromise,
    ]);
    if (result.type === "timeout") {
      controller.abort();
      await conditionPromise.catch(() => undefined);
      const soft = state.request.on_timeout === "exit_zero_with_timeout_marker";
      terminal = {
        state: "timed_out",
        payload: {
          handleId: state.id,
          outcome: "timed_out",
          status: "timeout",
          conditionKind: state.request.condition.kind,
          target: targetFor(state.request.condition),
          memo: state.request.memo,
          exitCode: soft ? 0 : 1,
          stdout: `${soft ? "TIMEOUT_MARKER" : "TIMEOUT"} — ${state.request.memo}`,
          hasTimeoutMarker: true,
        },
      };
    } else {
      terminal = {
        state: "met",
        payload: {
          handleId: state.id,
          outcome: "met",
          status: "completed",
          conditionKind: state.request.condition.kind,
          target: targetFor(state.request.condition, result.details),
          memo: state.request.memo,
          exitCode: 0,
          ...(result.details.stdout ? { stdout: result.details.stdout } : {}),
          ...(result.details.stderr ? { stderr: result.details.stderr } : {}),
        },
      };
    }
  } catch (error) {
    if (error.name === "AbortError" && abortRequested) {
      clearTimeout(timeoutTimer);
      persist({ state: "aborted", terminalAt: new Date().toISOString(), wake: { status: "suppressed" } });
      log("monitor.aborted");
      log("monitor.worker.exiting", { exitCode: 0, tmuxSession: state.tmuxSession });
      return;
    }
    terminal = {
      state: "error",
      payload: {
        handleId: state.id,
        outcome: "error",
        status: "failed",
        conditionKind: state.request.condition.kind,
        target: targetFor(state.request.condition),
        memo: state.request.memo,
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(timeoutTimer);
  }

  persist({ state: terminal.state, terminalAt: new Date().toISOString(), payload: terminal.payload });
  log("monitor.terminal", { outcome: terminal.payload.outcome, status: terminal.payload.status });
  try {
    await dispatchWake(terminal.payload);
  } catch (error) {
    persist({
      wake: {
        ...state.wake,
        status: "failed",
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    log("monitor.wake.failed", { error: state.wake.error });
    log("monitor.worker.exiting", { exitCode: 1, tmuxSession: state.tmuxSession });
    process.exitCode = 1;
    return;
  }
  log("monitor.worker.exiting", { exitCode: terminal.payload.exitCode, tmuxSession: state.tmuxSession });
  process.exitCode = terminal.payload.exitCode;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    persist({ state: "error", terminalAt: new Date().toISOString(), wake: { status: "failed", error: message } });
    log("monitor.worker.failed", { error: message });
  } catch {
    // The original error remains the useful failure when state persistence is unavailable.
  }
  try { log("monitor.worker.exiting", { exitCode: 1, tmuxSession: state.tmuxSession }); } catch {}
  console.error(message);
  process.exitCode = 1;
});
