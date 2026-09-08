import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export type Condition =
  | { kind: 'file_exists'; path: string }
  | {
      kind: 'file_matches';
      path: string;
      pattern?: string;
      contains?: string;
    }
  | { kind: 'process_exit'; pid: number }
  | { kind: 'timed'; seconds: number }
  | { kind: 'custom_command'; command: string };

export interface MonitorRequest {
  condition: Condition;
  interval_seconds: number;
  timeout_seconds: number;
  memo: string;
  on_timeout: 'exit_nonzero' | 'exit_zero_with_timeout_marker';
  background: true;
  notify_on_complete: true;
}

export interface WakePayload {
  handleId: string;
  outcome: 'met' | 'timed_out' | 'error';
  status: 'completed' | 'timeout' | 'failed';
  conditionKind: Condition['kind'];
  target: Record<string, unknown>;
  memo: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  hasTimeoutMarker?: boolean;
}

export interface WakeState {
  status: string;
  headline?: string;
  content?: string;
  backend?: string;
  transport?: string;
  [key: string]: unknown;
}

export interface DurableMonitorState {
  schemaVersion: number;
  id: string;
  state: string;
  conditionKey: string;
  request: MonitorRequest;
  threadId: string;
  workingDirectory: string;
  statePath: string;
  logPath: string;
  workerOutputPath: string;
  launcher: string;
  tmuxSession: string;
  createdAt: string;
  updatedAt: string;
  wake: WakeState;
  deliveryBackend: string;
  modelAffinity: string;
  workerPid?: number;
  wakeMode?: string;
  activatedAt?: string;
  terminalAt?: string;
  payload?: WakePayload;
}

export const ACTIVE_STATES = new Set(['armed', 'active']);
export const TERMINAL_STATES = new Set([
  'met',
  'timed_out',
  'aborted',
  'error',
]);
export const ON_TIMEOUT = new Set([
  'exit_nonzero',
  'exit_zero_with_timeout_marker',
]);

const TOP_LEVEL_KEYS = new Set([
  'condition',
  'interval_seconds',
  'timeout_seconds',
  'memo',
  'on_timeout',
  'background',
  'notify_on_complete',
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectAdditional(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) {
    throw new Error(
      `${label} additionalProperties is false; unexpected ${extra}`,
    );
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return candidate;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be an integer >= 1`);
  }
  return value as number;
}

export function validateCondition(input: unknown): Condition {
  const condition = record(input, 'condition');
  const kind = requiredString(condition, 'kind', 'condition');

  switch (kind) {
    case 'file_exists':
      rejectAdditional(condition, new Set(['kind', 'path']), 'condition');
      return { kind, path: requiredString(condition, 'path', 'condition') };
    case 'file_matches': {
      rejectAdditional(
        condition,
        new Set(['kind', 'path', 'pattern', 'contains']),
        'condition',
      );
      const path = requiredString(condition, 'path', 'condition');
      const { pattern, contains } = condition;
      if (pattern === undefined && contains === undefined) {
        throw new Error('condition.file_matches requires pattern or contains');
      }
      if (pattern !== undefined && typeof pattern !== 'string') {
        throw new Error('condition.pattern must be a string');
      }
      if (contains !== undefined && typeof contains !== 'string') {
        throw new Error('condition.contains must be a string');
      }
      if (pattern !== undefined) new RegExp(pattern);
      return {
        kind,
        path,
        ...(pattern === undefined ? {} : { pattern }),
        ...(contains === undefined ? {} : { contains }),
      };
    }
    case 'process_exit':
      rejectAdditional(condition, new Set(['kind', 'pid']), 'condition');
      return { kind, pid: positiveInteger(condition.pid, 'condition.pid') };
    case 'timed':
      rejectAdditional(condition, new Set(['kind', 'seconds']), 'condition');
      return {
        kind,
        seconds: positiveInteger(condition.seconds, 'condition.seconds'),
      };
    case 'custom_command':
      rejectAdditional(condition, new Set(['kind', 'command']), 'condition');
      return {
        kind,
        command: requiredString(condition, 'command', 'condition'),
      };
    case 'kanban_terminal':
      throw new Error(
        'kanban_terminal is Hermes-only and cannot arm in the Codex monitor',
      );
    case 'cmux_agent_stop':
      throw new Error(
        'cmux_agent_stop is deferred and cannot arm in monitor v1',
      );
    default:
      throw new Error(`condition unknown kind: ${kind}`);
  }
}

export function validateRequest(input: unknown): MonitorRequest {
  const request = record(input, 'monitor request');
  rejectAdditional(request, TOP_LEVEL_KEYS, 'monitor request');
  if (!('condition' in request)) {
    throw new Error('required field condition is missing');
  }
  const memo = requiredString(request, 'memo', 'monitor request');
  const condition = validateCondition(request.condition);
  const intervalSeconds =
    request.interval_seconds === undefined
      ? 10
      : positiveInteger(request.interval_seconds, 'interval_seconds');
  const timeoutSeconds =
    request.timeout_seconds === undefined
      ? condition.kind === 'timed'
        ? condition.seconds + 10
        : undefined
      : positiveInteger(request.timeout_seconds, 'timeout_seconds');
  if (condition.kind !== 'timed' && timeoutSeconds === undefined) {
    throw new Error(
      'timeout_seconds is required for non-timed monitor conditions in production',
    );
  }
  const onTimeout = request.on_timeout ?? 'exit_nonzero';
  if (!ON_TIMEOUT.has(String(onTimeout))) {
    throw new Error(
      'on_timeout must be exit_nonzero or exit_zero_with_timeout_marker',
    );
  }
  if (request.background !== undefined && request.background !== true) {
    throw new Error('background const is true');
  }
  if (
    request.notify_on_complete !== undefined &&
    request.notify_on_complete !== true
  ) {
    throw new Error('notify_on_complete const is true');
  }
  return {
    condition,
    interval_seconds: intervalSeconds,
    timeout_seconds: timeoutSeconds as number,
    memo,
    on_timeout: onTimeout as MonitorRequest['on_timeout'],
    background: true,
    notify_on_complete: true,
  };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function targetFor(
  condition: Condition,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  switch (condition.kind) {
    case 'file_exists':
    case 'file_matches':
      return {
        path: details.path ?? condition.path,
        ...(details.matched === undefined ? {} : { matched: details.matched }),
      };
    case 'process_exit':
      return { pid: condition.pid, exitCode: details.exitCode ?? null };
    case 'timed':
      return { seconds: condition.seconds };
    case 'custom_command':
      return {
        command: condition.command,
        ...(details.exitCode === undefined
          ? {}
          : { exitCode: details.exitCode }),
      };
  }
}

export function wakeText(payload: WakePayload): string {
  const lines = [
    'MONITOR EVENT',
    'boomerang: same-thread',
    `handle: ${payload.handleId}`,
    `outcome: ${payload.outcome}`,
    `status: ${payload.status}`,
    `condition: ${payload.conditionKind}`,
    `target: ${JSON.stringify(payload.target)}`,
    `memo: ${payload.memo}`,
  ];
  if (payload.hasTimeoutMarker) {
    lines.push(payload.exitCode === 0 ? 'TIMEOUT_MARKER' : 'TIMEOUT');
  }
  if (payload.stdout) lines.push(`stdout: ${payload.stdout}`);
  if (payload.stderr) lines.push(`stderr: ${payload.stderr}`);
  lines.push(
    'This is an automated monitor wake. Continue the originating task using the attributed outcome and memo, then report the result.',
  );
  return lines.join('\n');
}

export function dispatcherPrompt({ handle }: { handle: string }): string {
  return `$monitor | handle: ${handle}`;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

export function appendEvent(
  path: string,
  event: string,
  details: Record<string, unknown> = {},
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(
    path,
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`,
    { mode: 0o600 },
  );
}

export function shellQuote(value: unknown): string {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
