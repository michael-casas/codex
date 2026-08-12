#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ACTIVE_STATES,
  appendEvent,
  dispatcherPrompt,
  readJson,
  shellQuote,
  stableStringify,
  validateRequest,
  writeJsonAtomic,
} from "./monitor-core.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workerPath = join(scriptDirectory, "monitor-worker.mjs");
const monitorHome = resolve(
  process.env.CODEX_MONITOR_HOME
    ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "monitors"),
);
const handlesDirectory = join(monitorHome, "handles");
const logsDirectory = join(monitorHome, "logs");

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
}

function parseFlags(argumentsList) {
  const flags = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (key === "active") {
      flags[key] = true;
      continue;
    }
    const value = argumentsList[index + 1];
    if (value === undefined) throw new Error(`missing value for ${argument}`);
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function integerFlag(flags, key) {
  if (flags[key] === undefined) return undefined;
  const value = Number(flags[key]);
  if (!Number.isInteger(value)) throw new Error(`--${key} must be an integer`);
  return value;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function tmux(argumentsList, options = {}) {
  return spawnSync("tmux", argumentsList, {
    encoding: "utf8",
    ...options,
  });
}

function tmuxSessionAlive(sessionName) {
  if (!sessionName) return false;
  return tmux(["has-session", "-t", sessionName]).status === 0;
}

function tmuxPanePid(sessionName) {
  const result = tmux(["display-message", "-p", "-t", sessionName, "#{pane_pid}"]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `unable to resolve pane PID for tmux session ${sessionName}`);
  }
  const pid = Number(result.stdout.trim());
  if (!Number.isInteger(pid) || pid < 1) throw new Error(`invalid pane PID for tmux session ${sessionName}`);
  return pid;
}

function killTmuxSession(sessionName) {
  if (!tmuxSessionAlive(sessionName)) return false;
  tmux(["kill-session", "-t", sessionName]);
  return true;
}

function stateFiles() {
  if (!existsSync(handlesDirectory)) return [];
  return readdirSync(handlesDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(handlesDirectory, name));
}

function states() {
  return stateFiles().flatMap((path) => {
    try { return [readJson(path)]; } catch { return []; }
  });
}

function runtimeFor(state) {
  return {
    workerAlive: processAlive(state.workerPid),
    tmuxSessionAlive: tmuxSessionAlive(state.tmuxSession),
  };
}

function stateForHandle(handle) {
  const path = join(handlesDirectory, `${handle}.json`);
  if (!existsSync(path)) throw new Error(`monitor handle not found: ${handle}`);
  return { path, state: readJson(path) };
}

function arm(flags) {
  if (!flags.condition) throw new Error("--condition JSON is required");
  if (!flags.memo) throw new Error("--memo is required");
  const threadId = flags["thread-id"] ?? process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID;
  if (!threadId) throw new Error("--thread-id is required when CODEX_THREAD_ID is unavailable");
  const workingDirectory = resolve(flags.cwd ?? process.cwd());
  const condition = JSON.parse(flags.condition);
  const request = validateRequest({
    condition,
    memo: flags.memo,
    ...(integerFlag(flags, "interval-seconds") === undefined ? {} : { interval_seconds: integerFlag(flags, "interval-seconds") }),
    ...(integerFlag(flags, "timeout-seconds") === undefined ? {} : { timeout_seconds: integerFlag(flags, "timeout-seconds") }),
    ...(flags["on-timeout"] === undefined ? {} : { on_timeout: flags["on-timeout"] }),
  });
  const conditionKey = stableStringify({ threadId, condition: request.condition });
  const duplicate = states().find((candidate) =>
    ACTIVE_STATES.has(candidate.state)
    && candidate.conditionKey === conditionKey
    && (processAlive(candidate.workerPid) || tmuxSessionAlive(candidate.tmuxSession)));
  if (duplicate) {
    console.log(JSON.stringify({
      ok: true,
      armed: true,
      deduplicated: true,
      handle: duplicate.id,
      state: duplicate.state,
      condition: duplicate.request.condition,
      threadId: duplicate.threadId,
      workerPid: duplicate.workerPid,
      tmuxSession: duplicate.tmuxSession,
      statePath: duplicate.statePath,
      logPath: duplicate.logPath,
      workerOutputPath: duplicate.workerOutputPath,
    }, null, 2));
    return;
  }

  mkdirSync(handlesDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(logsDirectory, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const statePath = join(handlesDirectory, `${id}.json`);
  const logPath = join(logsDirectory, `${id}.jsonl`);
  const workerOutputPath = join(logsDirectory, `${id}.worker.log`);
  const tmuxSession = `codex-monitor-${id}`;
  const now = new Date().toISOString();
  const state = {
    schemaVersion: 2,
    id,
    state: "armed",
    conditionKey,
    request,
    threadId,
    workingDirectory,
    statePath,
    logPath,
    workerOutputPath,
    launcher: "tmux",
    tmuxSession,
    createdAt: now,
    updatedAt: now,
    wake: { status: "pending", headline: "MONITOR EVENT" },
    deliveryBackend: "desktop-heartbeat",
    // Model affinity is intentionally inherited from the resumed thread. An
    // explicit model override would risk a cache-busting model migration.
    modelAffinity: "inherit",
    ...(flags["wake-mode"] === undefined ? {} : { wakeMode: flags["wake-mode"] }),
  };
  if (state.wakeMode !== undefined && !(process.env.CODEX_MONITOR_ALLOW_TEST_WAKE === "1" && state.wakeMode === "log-only")) {
    throw new Error("--wake-mode is reserved for monitor self-tests");
  }
  writeJsonAtomic(statePath, state);
  appendEvent(logPath, "monitor.armed", { handleId: id, condition: request.condition, threadId });

  const version = tmux(["-V"]);
  if (version.status !== 0) throw new Error("tmux is required to arm a Codex monitor");

  const command = [
    "exec",
    shellQuote(process.execPath),
    shellQuote(workerPath),
    "--state",
    shellQuote(statePath),
    ">>",
    shellQuote(workerOutputPath),
    "2>&1",
  ].join(" ");
  const started = tmux([
    "new-session",
    "-d",
    "-s",
    tmuxSession,
    "-c",
    workingDirectory,
    command,
  ]);
  if (started.status !== 0) {
    throw new Error(started.stderr.trim() || `failed to start tmux session ${tmuxSession}`);
  }
  tmux(["set-window-option", "-t", tmuxSession, "remain-on-exit", "off"]);
  let workerPid;
  try {
    workerPid = tmuxPanePid(tmuxSession);
  } catch (error) {
    killTmuxSession(tmuxSession);
    throw error;
  }
  const latestState = readJson(statePath);
  writeJsonAtomic(statePath, { ...latestState, workerPid, updatedAt: new Date().toISOString() });
  appendEvent(logPath, "monitor.worker.spawned", {
    handleId: id,
    workerPid,
    launcher: "tmux",
    tmuxSession,
  });
  console.log(JSON.stringify({
    ok: true,
    armed: true,
    deduplicated: false,
    handle: id,
    state: "armed",
    condition: request.condition,
    threadId,
    workerPid,
    tmuxSession,
    statePath,
    logPath,
    workerOutputPath,
  }, null, 2));
}

function list(flags) {
  const rows = states()
    .filter((state) => !flags.active || ACTIVE_STATES.has(state.state))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((state) => ({ ...state, runtime: runtimeFor(state) }));
  console.log(JSON.stringify({ ok: true, count: rows.length, monitors: rows }, null, 2));
}

function status(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  const { state } = stateForHandle(flags.handle);
  console.log(JSON.stringify({ ok: true, monitor: state, runtime: runtimeFor(state) }, null, 2));
}

function poll(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  const { state } = stateForHandle(flags.handle);
  const wakeStatus = state.wake?.status;
  console.log(JSON.stringify({
    ok: true,
    handle: state.id,
    threadId: state.threadId,
    state: state.state,
    ready: wakeStatus === "awaiting_host_dispatch",
    stop: ["completed", "host_dispatch_accepted", "host_message_accepted", "suppressed", "failed"].includes(wakeStatus),
    wakeStatus,
    ...(wakeStatus === "awaiting_host_dispatch" ? { wakeText: state.wake.content } : {}),
  }, null, 2));
}

function acknowledge(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  if (flags.delivery !== "host-message-accepted") {
    throw new Error("--delivery host-message-accepted is required after send_message_to_thread succeeds");
  }
  const { path, state } = stateForHandle(flags.handle);
  if (["host_dispatch_accepted", "host_message_accepted"].includes(state.wake?.status)) {
    console.log(JSON.stringify({ ok: true, handle: state.id, acknowledged: true, deduplicated: true }, null, 2));
    return;
  }
  if (state.wake?.status !== "awaiting_host_dispatch") {
    throw new Error(`monitor wake cannot be acknowledged from ${state.wake?.status ?? "missing"}`);
  }
  const acceptedAt = new Date().toISOString();
  const nextState = {
    ...state,
    updatedAt: acceptedAt,
    wake: {
      ...state.wake,
      status: "host_message_accepted",
      acceptedAt,
      backend: "desktop-heartbeat",
      transport: "send_message_to_thread",
    },
  };
  writeJsonAtomic(path, nextState);
  appendEvent(state.logPath, "monitor.wake.host_message_accepted", {
    handleId: state.id,
    backend: "desktop-heartbeat",
    transport: "send_message_to_thread",
  });
  console.log(JSON.stringify({ ok: true, handle: state.id, acknowledged: true, deduplicated: false }, null, 2));
}

function printDispatcherPrompt(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  const { state } = stateForHandle(flags.handle);
  console.log(dispatcherPrompt({
    handle: state.id,
  }));
}

function trace(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  const { state } = stateForHandle(flags.handle);
  const lines = integerFlag(flags, "lines") ?? 100;
  const events = existsSync(state.logPath)
    ? readFileSync(state.logPath, "utf8").trimEnd().split("\n").slice(-lines).map((line) => JSON.parse(line))
    : [];
  console.log(JSON.stringify({ ok: true, monitor: state, runtime: runtimeFor(state), events }, null, 2));
}

function flushHandle(handle) {
  const { state } = stateForHandle(handle);
  if (!ACTIVE_STATES.has(state.state)) return { handle, flushed: false, reason: `already ${state.state}` };
  if (processAlive(state.workerPid)) {
    process.kill(state.workerPid, "SIGTERM");
    return { handle, flushed: true, tmuxSession: state.tmuxSession };
  }
  if (killTmuxSession(state.tmuxSession)) {
    return { handle, flushed: true, tmuxSession: state.tmuxSession, reason: "stale tmux session removed" };
  }
  return { handle, flushed: false, reason: "worker process and tmux session missing" };
}

function flush(flags) {
  if (!flags.handle) throw new Error("--handle is required");
  console.log(JSON.stringify({ ok: true, ...flushHandle(flags.handle) }, null, 2));
}

function flushAll() {
  const results = states().filter((state) => ACTIVE_STATES.has(state.state)).map((state) => flushHandle(state.id));
  console.log(JSON.stringify({ ok: true, flushedCount: results.filter((result) => result.flushed).length, results }, null, 2));
}

function help() {
  console.log(`monitor — durable condition watcher with Codex same-thread boomerang wakes

Usage:
  monitor arm --condition '<json>' --memo '<text>' [--timeout-seconds N]
  monitor list [--active]
  monitor status --handle <uuid>
  monitor poll --handle <uuid>
  monitor dispatcher-prompt --handle <uuid>
  monitor acknowledge --handle <uuid> --delivery host-message-accepted
  monitor trace --handle <uuid> [--lines N]
  monitor flush --handle <uuid>
  monitor flush-all`);
}

try {
  const [command = "help", ...argumentList] = process.argv.slice(2);
  const flags = parseFlags(argumentList);
  switch (command) {
    case "arm": arm(flags); break;
    case "list": list(flags); break;
    case "status": status(flags); break;
    case "poll": poll(flags); break;
    case "dispatcher-prompt": printDispatcherPrompt(flags); break;
    case "acknowledge": acknowledge(flags); break;
    case "trace": trace(flags); break;
    case "flush": flush(flags); break;
    case "flush-all": flushAll(); break;
    case "help":
    case "--help":
    case "-h": help(); break;
    default: throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
