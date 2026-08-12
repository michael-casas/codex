import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { waitForCondition } from "./monitor-conditions.mjs";
import { dispatcherPrompt, stableStringify, validateRequest, wakeText } from "./monitor-core.mjs";

test("timed request receives Pi-compatible defaults", () => {
  const request = validateRequest({ condition: { kind: "timed", seconds: 5 }, memo: "wake later" });
  assert.equal(request.interval_seconds, 10);
  assert.equal(request.timeout_seconds, 15);
  assert.equal(request.background, true);
  assert.equal(request.notify_on_complete, true);
  assert.equal(request.on_timeout, "exit_nonzero");
});

test("non-timed requests require a production timeout", () => {
  assert.throws(
    () => validateRequest({ condition: { kind: "file_exists", path: "/tmp/missing" }, memo: "bounded" }),
    /timeout_seconds is required/,
  );
});

test("deferred Pi kinds reject before arming", () => {
  assert.throws(
    () => validateRequest({ condition: { kind: "kanban_terminal", task_ids: ["task-1"] }, memo: "wait" }),
    /Hermes-only/,
  );
  assert.throws(
    () => validateRequest({ condition: { kind: "cmux_agent_stop", surface: "surface:1" }, memo: "wait" }),
    /deferred/,
  );
});

test("wake events use the canonical MONITOR EVENT headline", () => {
  const content = wakeText({
    handleId: "handle-1",
    outcome: "met",
    status: "completed",
    conditionKind: "timed",
    target: { seconds: 2 },
    memo: "continue",
    exitCode: 0,
  });
  assert.equal(content.split("\n")[0], "MONITOR EVENT");
  assert.match(content, /boomerang: same-thread/);
});

test("stable condition keys ignore object key order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});

test("scheduled dispatcher prompt is only the monitor skill invocation and handle", () => {
  const prompt = dispatcherPrompt({
    handle: "0f5aa658-8ea5-4d00-a7aa-e8a780e97fc2",
  });
  assert.equal(prompt, "$monitor | handle: 0f5aa658-8ea5-4d00-a7aa-e8a780e97fc2");
});

test("file_exists and file_matches resolve concrete targets", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-monitor-test-"));
  const path = join(directory, "ready.txt");
  writeFileSync(path, "status: READY\n");
  const controller = new AbortController();
  assert.deepEqual(
    await waitForCondition({ kind: "file_exists", path }, 10, controller.signal),
    { path },
  );
  assert.deepEqual(
    await waitForCondition({ kind: "file_matches", path, contains: "READY" }, 10, controller.signal),
    { path, matched: "READY" },
  );
});

test("custom_command returns captured output on exit zero", async () => {
  const controller = new AbortController();
  const result = await waitForCondition(
    { kind: "custom_command", command: "printf 'monitor-ready'" },
    10,
    controller.signal,
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "monitor-ready");
});

test("synchronous monitor stalls the active caller until a regular file matches", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-sync-monitor-test-"));
  const path = join(directory, "AUDIT.md");
  const monitor = fileURLToPath(new URL("./sync-monitor.mjs", import.meta.url));
  const child = spawn(process.execPath, [
    monitor,
    path,
    "--contains", "EXTERNAL_AUDIT_COMPLETE",
    "--timeout", "2",
    "--interval", "50",
  ], { encoding: "utf8" });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  writeFileSync(path, "EXTERNAL_AUDIT_COMPLETE\n");
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(exitCode, 0, stderr);
  assert.match(stdout, /^WAITING /m);
  assert.match(stdout, /^CONDITION_MET /m);
});

test("synchronous monitor times out with exit 124", () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-sync-monitor-timeout-"));
  const monitor = fileURLToPath(new URL("./sync-monitor.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    monitor,
    join(directory, "missing.md"),
    "--timeout", "0.05",
    "--interval", "50",
  ], { encoding: "utf8" });
  assert.equal(result.status, 124);
  assert.match(result.stderr, /^TIMEOUT /m);
});

test("tmux boomerang environment self-tears down after wake completion", { timeout: 10_000 }, async (context) => {
  if (spawnSync("tmux", ["-V"]).status !== 0) {
    context.skip("tmux is not installed");
    return;
  }

  const monitorHome = mkdtempSync(join(tmpdir(), "codex-monitor-integration-"));
  const monitor = fileURLToPath(new URL("./monitor", import.meta.url));
  const armedResult = spawnSync(monitor, [
    "arm",
    "--thread-id", "integration-test-thread",
    "--condition", JSON.stringify({ kind: "timed", seconds: 1 }),
    "--memo", "verify tmux teardown",
    "--wake-mode", "log-only",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_MONITOR_HOME: monitorHome,
      CODEX_MONITOR_ALLOW_TEST_WAKE: "1",
    },
  });
  assert.equal(armedResult.status, 0, armedResult.stderr || armedResult.stdout);
  const armed = JSON.parse(armedResult.stdout);
  const statePath = join(monitorHome, "handles", `${armed.handle}.json`);

  let state;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      state = JSON.parse(readFileSync(statePath, "utf8"));
      if (state.state === "met" && state.wake.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(state?.state, "met");
    assert.equal(state?.wake.status, "completed");
    assert.equal(state?.launcher, "tmux");
    assert.equal(state?.modelAffinity, "inherit");
    assert.equal(spawnSync("tmux", ["has-session", "-t", armed.tmuxSession]).status, 1);
    const statusResult = spawnSync(monitor, ["status", "--handle", armed.handle], {
      encoding: "utf8",
      env: { ...process.env, CODEX_MONITOR_HOME: monitorHome },
    });
    assert.equal(statusResult.status, 0, statusResult.stderr || statusResult.stdout);
    assert.deepEqual(JSON.parse(statusResult.stdout).runtime, {
      workerAlive: false,
      tmuxSessionAlive: false,
    });
  } finally {
    if (spawnSync("tmux", ["has-session", "-t", armed.tmuxSession]).status === 0) {
      spawnSync("tmux", ["kill-session", "-t", armed.tmuxSession]);
    }
  }
});

test("production wake waits for host dispatch and can be polled and acknowledged", { timeout: 10_000 }, async (context) => {
  if (spawnSync("tmux", ["-V"]).status !== 0) {
    context.skip("tmux is not installed");
    return;
  }

  const monitorHome = mkdtempSync(join(tmpdir(), "codex-monitor-host-dispatch-"));
  const monitor = fileURLToPath(new URL("./monitor", import.meta.url));
  const environment = { ...process.env, CODEX_MONITOR_HOME: monitorHome };
  const armedResult = spawnSync(monitor, [
    "arm",
    "--thread-id", "integration-test-thread",
    "--condition", JSON.stringify({ kind: "timed", seconds: 1 }),
    "--memo", "verify host dispatch boundary",
  ], { encoding: "utf8", env: environment });
  assert.equal(armedResult.status, 0, armedResult.stderr || armedResult.stdout);
  const armed = JSON.parse(armedResult.stdout);
  const statePath = join(monitorHome, "handles", `${armed.handle}.json`);

  let state;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      state = JSON.parse(readFileSync(statePath, "utf8"));
      if (state.state === "met" && state.wake.status === "awaiting_host_dispatch") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(state?.state, "met");
    assert.equal(state?.wake.status, "awaiting_host_dispatch");
    assert.equal(state?.wake.backend, "desktop-heartbeat");
    assert.equal(state?.wake.content.split("\n")[0], "MONITOR EVENT");
    assert.equal(state?.deliveryBackend, "desktop-heartbeat");
    assert.equal(spawnSync("tmux", ["has-session", "-t", armed.tmuxSession]).status, 1);

    const pollResult = spawnSync(monitor, ["poll", "--handle", armed.handle], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(pollResult.status, 0, pollResult.stderr || pollResult.stdout);
    const polled = JSON.parse(pollResult.stdout);
    assert.equal(polled.ready, true);
    assert.equal(polled.stop, false);
    assert.equal(polled.threadId, "integration-test-thread");
    assert.equal(polled.wakeText, state.wake.content);

    const rejectedAcknowledge = spawnSync(monitor, ["acknowledge", "--handle", armed.handle], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(rejectedAcknowledge.status, 1);
    assert.match(rejectedAcknowledge.stderr, /--delivery host-message-accepted is required/);

    const acknowledgeResult = spawnSync(monitor, [
      "acknowledge", "--handle", armed.handle,
      "--delivery", "host-message-accepted",
    ], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(acknowledgeResult.status, 0, acknowledgeResult.stderr || acknowledgeResult.stdout);
    assert.equal(JSON.parse(acknowledgeResult.stdout).acknowledged, true);

    const afterAcknowledge = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(afterAcknowledge.wake.status, "host_message_accepted");
    assert.equal(afterAcknowledge.wake.transport, "send_message_to_thread");
    const finalPoll = spawnSync(monitor, ["poll", "--handle", armed.handle], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(finalPoll.status, 0, finalPoll.stderr || finalPoll.stdout);
    assert.equal(JSON.parse(finalPoll.stdout).stop, true);
  } finally {
    if (spawnSync("tmux", ["has-session", "-t", armed.tmuxSession]).status === 0) {
      spawnSync("tmux", ["kill-session", "-t", armed.tmuxSession]);
    }
  }
});
