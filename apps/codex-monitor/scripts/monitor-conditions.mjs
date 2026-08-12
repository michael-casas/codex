import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_CAPTURE_BYTES = 65_536;

export function abortError() {
  const error = new Error('monitor aborted');
  error.name = 'AbortError';
  return error;
}

export function delay(milliseconds, signal) {
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

function probeProcess(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function boundedAppend(current, chunk) {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return `${current}${String(chunk)}`.slice(0, MAX_CAPTURE_BYTES);
}

function signalOwnedProcess(child, signal) {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code === 'ESRCH') return;
    }
  }
  child.kill(signal);
}

export function runCommand(command, signal) {
  return new Promise((resolveCommand, rejectCommand) => {
    if (signal.aborted) return rejectCommand(abortError());
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn('/bin/sh', ['-c', command], {
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk);
    });

    const abort = () => {
      if (settled) return;
      signalOwnedProcess(child, 'SIGTERM');
      setTimeout(() => {
        if (!settled && child.exitCode === null)
          signalOwnedProcess(child, 'SIGKILL');
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

async function poll(check, intervalMilliseconds, signal, onObservation) {
  while (!signal.aborted) {
    const result = await check();
    onObservation?.(result);
    if (result?.met) return result.details;
    await delay(intervalMilliseconds, signal);
  }
  throw abortError();
}

export async function waitForCondition(
  condition,
  intervalMilliseconds,
  signal,
  onObservation,
) {
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
          let content;
          try {
            content = readFileSync(path, 'utf8');
          } catch (error) {
            if (error.code === 'ENOENT') return { met: false };
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
              : { met: true, details: { pid: condition.pid, exitCode: null } },
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
    default:
      throw new Error(`unsupported condition kind: ${condition.kind}`);
  }
}
