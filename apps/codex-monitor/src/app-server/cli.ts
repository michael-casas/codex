#!/usr/bin/env bun

import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

import { AmbiguousDisconnect, AppServerClient } from './client.js';
import { MonitorState } from './state.js';

interface ArmArguments {
  command: 'arm';
  seconds: number;
  threadId: string;
  memo: string;
  cwd: string;
  codexBin: string;
  turnTimeout: number;
  launcher: 'process' | 'tmux';
}

interface WorkerArguments {
  command: 'worker';
  state: string;
  handle: string;
  marker: string;
  threadId: string;
  cwd: string;
  fireAt: number;
  codexBin: string;
  turnTimeout: number;
}

type Arguments = ArmArguments | WorkerArguments;

const cliPath = fileURLToPath(import.meta.url);

function stateRoot(): string {
  return join(
    process.env.CODEX_HOME ?? join(homedir(), '.codex'),
    'monitors',
    'app-server-spike',
  );
}

export function wakeText(
  handle: string,
  markerId: string,
  seconds: number,
  memo: string,
): string {
  return [
    'MONITOR EVENT',
    'boomerang: app-server-python-spike',
    `handle: ${handle}`,
    'outcome: met',
    'status: completed',
    `condition: timed ${seconds}s`,
    `marker: MONITOR_APP_SERVER_SPIKE_${markerId}`,
    `memo: ${memo}`,
    'This is an App Server visibility test. Confirm this MONITOR EVENT visibly surfaced in this exact Codex Desktop task, report the handle and marker only, and stop. Do not modify files or continue unrelated work.',
  ].join('\n');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function errorName(error: unknown): string {
  if (error instanceof AmbiguousDisconnect) return error.name;
  return 'RuntimeError';
}

async function runWorker(args: WorkerArguments): Promise<number> {
  const state = new MonitorState(args.state, args.handle, args.marker);
  if (state.snapshot.phase === 'armed') state.transition('waiting');
  const remaining = Math.max(0, args.fireAt * 1_000 - Date.now());
  if (remaining > 0) await delay(remaining);
  state.transition('condition_met');
  if (state.snapshot.modelAffinity !== 'inherit') {
    throw new Error(
      'monitor model affinity must be inherit; explicit model overrides are forbidden',
    );
  }
  const client = new AppServerClient(
    [args.codexBin, 'app-server', '--listen', 'stdio://'],
    args.turnTimeout,
  );
  try {
    const before = await client.readThread(args.threadId);
    if (AppServerClient.containsMarker(before, args.marker)) {
      state.markPersistedWithoutSubmit('existing');
      return 0;
    }
    const outcome = await client.submit(args.threadId, args.marker, {
      cwd: args.cwd,
    });
    state.transition('request_accepted', {
      request_id: 3,
      turn_id: outcome.turn_id,
    });
    state.transition('turn_terminal_observed', { turn_id: outcome.turn_id });
    const after = await client.readThread(args.threadId);
    if (!AppServerClient.containsMarker(after, args.marker)) {
      throw new Error('terminal turn was not found after reconnect');
    }
    state.transition('persisted_reconciled', { turn_id: outcome.turn_id });
    return 0;
  } catch (error) {
    state.annotate({
      error_type: errorName(error),
      error: error instanceof Error ? error.message : String(error),
      failed_at: Date.now() / 1_000,
    });
    return 1;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function arm(args: ArmArguments): number {
  const handle = randomUUID();
  const marker = wakeText(handle, randomUUID(), args.seconds, args.memo);
  const root = stateRoot();
  const statePath = join(root, 'handles', `${handle}.json`);
  const logPath = join(root, 'logs', `${handle}.log`);
  const state = new MonitorState(statePath, handle, marker);
  const fireAt = Date.now() / 1_000 + args.seconds;
  state.annotate({
    thread_id: args.threadId,
    seconds: args.seconds,
    fire_at: fireAt,
    cwd: args.cwd,
    log_path: logPath,
    modelAffinity: 'inherit',
  });
  mkdirSync(dirname(logPath), { recursive: true });
  const command = [
    process.execPath,
    cliPath,
    'worker',
    '--state',
    statePath,
    '--handle',
    handle,
    '--marker',
    marker,
    '--thread-id',
    args.threadId,
    '--cwd',
    args.cwd,
    '--fire-at',
    String(fireAt),
    '--codex-bin',
    args.codexBin,
    '--turn-timeout',
    String(args.turnTimeout),
  ];
  const environment = { ...process.env };
  delete environment.CODEX_INTERNAL_ORIGINATOR_OVERRIDE;

  let pid: number;
  let session: string | undefined;
  if (args.launcher === 'tmux') {
    session = `codex-monitor-app-server-${handle.slice(0, 8)}`;
    const shellCommand = [
      'exec env -u CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
      ...command.map(shellQuote),
      `>>${shellQuote(logPath)} 2>&1`,
    ].join(' ');
    const started = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', session, '-c', args.cwd, shellCommand],
      { env: environment, encoding: 'utf8' },
    );
    if (started.status !== 0) {
      throw new Error(started.stderr.trim() || 'failed to start tmux worker');
    }
    const pane = spawnSync(
      'tmux',
      ['display-message', '-p', '-t', session, '#{pane_pid}'],
      { encoding: 'utf8' },
    );
    if (pane.status !== 0) {
      throw new Error(pane.stderr.trim() || 'failed to resolve tmux worker');
    }
    pid = Number(pane.stdout.trim());
    state.annotate({
      launcher: 'tmux',
      tmux_session: session,
      worker_pid: pid,
    });
  } else {
    const log = openSync(logPath, 'a');
    try {
      const worker = spawn(command[0], command.slice(1), {
        detached: true,
        env: environment,
        stdio: ['ignore', log, log],
      });
      if (!worker.pid) throw new Error('failed to start monitor worker');
      pid = worker.pid;
      worker.unref();
    } finally {
      closeSync(log);
    }
    state.annotate({ launcher: 'process', worker_pid: pid });
  }
  console.log(
    JSON.stringify({
      handle,
      pid,
      state: statePath,
      log: logPath,
      fire_at: fireAt,
      launcher: args.launcher,
      ...(session ? { tmux_session: session } : {}),
    }),
  );
  return 0;
}

function rootHelp(): string {
  return `usage: codex-monitor-app-server-spike [-h] {arm,worker} ...

positional arguments:
  {arm,worker}

options:
  -h, --help    show this help message and exit`;
}

function usageError(message: string): never {
  process.stderr.write(`${rootHelp().split('\n\n')[0]}\n`);
  process.stderr.write(`codex-monitor-app-server-spike: error: ${message}\n`);
  process.exit(2);
}

function options(
  values: string[],
  allowed: ReadonlySet<string>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (!flag?.startsWith('--')) usageError(`unrecognized arguments: ${flag}`);
    const separator = flag.indexOf('=');
    const key = flag.slice(2, separator === -1 ? undefined : separator);
    if (!allowed.has(key)) usageError(`unrecognized arguments: --${key}`);
    const value =
      separator === -1 ? values[index + 1] : flag.slice(separator + 1);
    if (value === undefined)
      usageError(`argument ${flag}: expected one argument`);
    result.set(key, value);
    if (separator === -1) index += 1;
  }
  return result;
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (value === undefined)
    usageError(`the following arguments are required: --${key}`);
  return value;
}

function numberOption(
  values: Map<string, string>,
  key: string,
  fallback?: number,
): number {
  const raw = values.get(key);
  if (raw === undefined) {
    if (fallback === undefined)
      usageError(`the following arguments are required: --${key}`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value))
    usageError(`argument --${key}: invalid value: '${raw}'`);
  return value;
}

const ARM_OPTIONS = new Set([
  'seconds',
  'thread-id',
  'memo',
  'cwd',
  'codex-bin',
  'turn-timeout',
  'launcher',
]);
const WORKER_OPTIONS = new Set([
  'state',
  'handle',
  'marker',
  'thread-id',
  'cwd',
  'fire-at',
  'codex-bin',
  'turn-timeout',
]);

function parseArguments(argv: string[]): Arguments | 'help' {
  const [command, ...rest] = argv;
  if (command === '-h' || command === '--help') return 'help';
  if (!command) usageError('the following arguments are required: command');
  if (command !== 'arm' && command !== 'worker') {
    usageError(
      `argument command: invalid choice: '${command}' (choose from 'arm', 'worker')`,
    );
  }
  if (rest.includes('-h') || rest.includes('--help')) return 'help';
  const values = options(
    rest,
    command === 'arm' ? ARM_OPTIONS : WORKER_OPTIONS,
  );
  if (command === 'arm') {
    const secondsText = required(values, 'seconds');
    if (!/^[+-]?\d+$/.test(secondsText)) {
      usageError(`argument --seconds: invalid int value: '${secondsText}'`);
    }
    const seconds = Number(secondsText);
    const launcher = values.get('launcher') ?? 'process';
    if (launcher !== 'process' && launcher !== 'tmux') {
      usageError(`argument --launcher: invalid choice: '${launcher}'`);
    }
    return {
      command,
      seconds,
      threadId: required(values, 'thread-id'),
      memo: required(values, 'memo'),
      cwd: resolve(required(values, 'cwd')),
      codexBin: values.get('codex-bin') ?? 'codex',
      turnTimeout: numberOption(values, 'turn-timeout', 300),
      launcher,
    };
  }
  return {
    command,
    state: required(values, 'state'),
    handle: required(values, 'handle'),
    marker: required(values, 'marker'),
    threadId: required(values, 'thread-id'),
    cwd: resolve(required(values, 'cwd')),
    fireAt: numberOption(values, 'fire-at'),
    codexBin: required(values, 'codex-bin'),
    turnTimeout: numberOption(values, 'turn-timeout'),
  };
}

async function main(): Promise<number> {
  const args = parseArguments(process.argv.slice(2));
  if (args === 'help') {
    console.log(rootHelp());
    return 0;
  }
  if (args.command === 'arm') {
    if (args.seconds <= 0) {
      process.stderr.write('--seconds must be positive\n');
      return 1;
    }
    return arm(args);
  }
  return runWorker(args);
}

process.exitCode = await main();
