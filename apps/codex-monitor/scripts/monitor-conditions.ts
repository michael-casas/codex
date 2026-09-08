import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Condition } from './monitor-core.js';

const MAX_CAPTURE_BYTES = 65_536;

export interface CommandResult {
  [key: string]: unknown;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type ConditionDetails = Record<string, unknown> & Partial<CommandResult>;

interface Observation {
  met: boolean;
  details?: ConditionDetails;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

export function abortError(): Error {
  const error = new Error('monitor aborted');
  error.name = 'AbortError';
  return error;
}

export function delay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal.aborted) return rejectDelay(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolveDelay();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      rejectDelay(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function probeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return false;
    if (errorCode(error) === 'EPERM') return true;
    throw error;
  }
}

function boundedAppend(current: string, chunk: unknown): string {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return `${current}${String(chunk)}`.slice(0, MAX_CAPTURE_BYTES);
}

function signalOwnedProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (errorCode(error) === 'ESRCH') return;
    }
  }
  child.kill(signal);
}

export function runCommand(
  command: string,
  signal: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    if (signal.aborted) return rejectCommand(abortError());
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn('/bin/sh', ['-c', command], {
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = boundedAppend(stderr, chunk);
    });

    const abort = () => {
      if (settled) return;
      signalOwnedProcess(child, 'SIGTERM');
      setTimeout(() => {
        if (!settled && child.exitCode === null) {
          signalOwnedProcess(child, 'SIGKILL');
        }
      }, 150).unref();
    };
    signal.addEventListener('abort', abort, { once: true });

    child.once('error', (error) => {
      settled = true;
      signal.removeEventListener('abort', abort);
      rejectCommand(error);
    });
    child.once('close', (exitCode) => {
      settled = true;
      signal.removeEventListener('abort', abort);
      if (signal.aborted) return rejectCommand(abortError());
      resolveCommand({ command, exitCode, stdout, stderr });
    });
  });
}

async function poll(
  check: () => Promise<Observation>,
  intervalMilliseconds: number,
  signal: AbortSignal,
  onObservation?: (observation: Observation) => void,
): Promise<ConditionDetails> {
  while (!signal.aborted) {
    const result = await check();
    onObservation?.(result);
    if (result.met) return result.details ?? {};
    await delay(intervalMilliseconds, signal);
  }
  throw abortError();
}

export async function waitForCondition(
  condition: Condition,
  intervalMilliseconds: number,
  signal: AbortSignal,
  onObservation?: (observation: Observation) => void,
): Promise<ConditionDetails> {
  switch (condition.kind) {
    case 'timed':
      await delay(condition.seconds * 1_000, signal);
      return { seconds: condition.seconds };
    case 'file_exists': {
      const path = resolve(condition.path);
      return poll(
        () =>
          Promise.resolve(
            existsSync(path)
              ? { met: true, details: { path } }
              : { met: false },
          ),
        intervalMilliseconds,
        signal,
        onObservation,
      );
    }
    case 'file_matches': {
      const path = resolve(condition.path);
      const pattern =
        condition.pattern === undefined
          ? undefined
          : new RegExp(condition.pattern);
      return poll(
        async () => {
          if (!existsSync(path)) return { met: false };
          let content: string;
          try {
            content = readFileSync(path, 'utf8');
          } catch (error) {
            if (errorCode(error) === 'ENOENT') return { met: false };
            throw error;
          }
          if (pattern) {
            const match = pattern.exec(content);
            if (match)
              return { met: true, details: { path, matched: match[0] } };
          }
          if (
            condition.contains !== undefined &&
            content.includes(condition.contains)
          ) {
            return {
              met: true,
              details: { path, matched: condition.contains },
            };
          }
          return { met: false };
        },
        intervalMilliseconds,
        signal,
        onObservation,
      );
    }
    case 'process_exit':
      return poll(
        () =>
          Promise.resolve(
            probeProcess(condition.pid)
              ? { met: false }
              : {
                  met: true,
                  details: { pid: condition.pid, exitCode: null },
                },
          ),
        intervalMilliseconds,
        signal,
        onObservation,
      );
    case 'custom_command':
      return poll(
        async () => {
          const result = await runCommand(condition.command, signal);
          return result.exitCode === 0
            ? { met: true, details: result }
            : { met: false, details: { exitCode: result.exitCode } };
        },
        intervalMilliseconds,
        signal,
        onObservation,
      );
  }
}
