#!/usr/bin/env node
/**
 * Foreground condition-wait shim adapted from the Founder-designated source:
 * ~/Documents/repos/github.com/atlantis-electrical/atlantis-electrical/
 * .agent/shims/monitor.js
 *
 * Keep this process in the foreground to stall the current Codex turn. This
 * is deliberately separate from the detached monitor/heartbeat protocol.
 */

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const targetArgument = args.shift();
const options = {
  contains: undefined,
  regex: undefined,
  timeoutSeconds: undefined,
  intervalMilliseconds: 500,
};

function failUsage(message) {
  if (message) console.error(message);
  console.error(
    "usage: sync-monitor.mjs <file-path> [--contains text | --regex pattern] [--timeout seconds] [--interval milliseconds]",
  );
  process.exit(64);
}

if (!targetArgument) failUsage();

while (args.length > 0) {
  const flag = args.shift();
  const value = args.shift();
  if (value === undefined) failUsage(`missing value for ${flag}`);
  if (flag === "--contains") options.contains = value;
  else if (flag === "--regex") options.regex = value;
  else if (flag === "--timeout") options.timeoutSeconds = Number(value);
  else if (flag === "--interval") options.intervalMilliseconds = Number(value);
  else failUsage(`unknown option: ${flag}`);
}

if (options.contains !== undefined && options.regex !== undefined) {
  failUsage("choose only one of --contains or --regex");
}
if (
  options.timeoutSeconds !== undefined &&
  (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0)
) {
  failUsage("--timeout must be a positive number of seconds");
}
if (
  !Number.isFinite(options.intervalMilliseconds) ||
  options.intervalMilliseconds < 50
) {
  failUsage("--interval must be at least 50 milliseconds");
}

let matcher = () => true;
if (options.contains !== undefined) {
  matcher = (content) => content.includes(options.contains);
} else if (options.regex !== undefined) {
  let expression;
  try {
    expression = new RegExp(options.regex);
  } catch (error) {
    failUsage(`invalid --regex: ${error.message}`);
  }
  matcher = (content) => expression.test(content);
}

const target = resolve(targetArgument);
const deadline =
  options.timeoutSeconds === undefined
    ? undefined
    : Date.now() + options.timeoutSeconds * 1_000;

function check() {
  try {
    const metadata = statSync(target);
    if (metadata.isFile()) {
      const content = readFileSync(target, "utf8");
      if (matcher(content)) {
        console.log(`CONDITION_MET ${target}`);
        process.exit(0);
      }
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
  }

  if (deadline !== undefined && Date.now() >= deadline) {
    console.error(`TIMEOUT ${target}`);
    process.exit(124);
  }
}

process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

console.log(`WAITING ${target}`);
check();
setInterval(check, options.intervalMilliseconds);
