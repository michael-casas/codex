#!/usr/bin/env bun

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

interface Options {
  contains?: string;
  regex?: string;
  timeoutSeconds?: number;
  intervalMilliseconds: number;
}

const args = process.argv.slice(2);
const targetArgument = args.shift();
const options: Options = { intervalMilliseconds: 500 };

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failUsage(message?: string): never {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    'usage: sync-monitor.mjs <file-path> [--contains text | --regex pattern] [--timeout seconds] [--interval milliseconds]\n',
  );
  process.exit(64);
}

if (!targetArgument) failUsage();

while (args.length > 0) {
  const flag = args.shift();
  const value = args.shift();
  if (value === undefined) failUsage(`missing value for ${flag}`);
  if (flag === '--contains') options.contains = value;
  else if (flag === '--regex') options.regex = value;
  else if (flag === '--timeout') options.timeoutSeconds = Number(value);
  else if (flag === '--interval') options.intervalMilliseconds = Number(value);
  else failUsage(`unknown option: ${flag}`);
}

if (options.contains !== undefined && options.regex !== undefined) {
  failUsage('choose only one of --contains or --regex');
}
if (
  options.timeoutSeconds !== undefined &&
  (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0)
) {
  failUsage('--timeout must be a positive number of seconds');
}
if (
  !Number.isFinite(options.intervalMilliseconds) ||
  options.intervalMilliseconds < 50
) {
  failUsage('--interval must be at least 50 milliseconds');
}

let matcher: (content: string) => boolean = () => true;
if (options.contains !== undefined) {
  const contains = options.contains;
  matcher = (content) => content.includes(contains);
} else if (options.regex !== undefined) {
  let expression: RegExp;
  try {
    expression = new RegExp(options.regex);
  } catch (error) {
    failUsage(`invalid --regex: ${errorMessage(error)}`);
  }
  matcher = (content) => expression.test(content);
}

const target = resolve(targetArgument);
const deadline =
  options.timeoutSeconds === undefined
    ? undefined
    : Date.now() + options.timeoutSeconds * 1_000;

function check(): void {
  try {
    const metadata = statSync(target);
    if (metadata.isFile()) {
      const content = readFileSync(target, 'utf8');
      if (matcher(content)) {
        console.log(`CONDITION_MET ${target}`);
        process.exit(0);
      }
    }
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '')) throw error;
  }
  if (deadline !== undefined && Date.now() >= deadline) {
    process.stderr.write(`TIMEOUT ${target}\n`);
    process.exit(124);
  }
}

process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

console.log(`WAITING ${target}`);
check();
setInterval(check, options.intervalMilliseconds);
