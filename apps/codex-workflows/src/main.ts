#!/usr/bin/env node
import { executeCli } from './cli/cli.js';

async function main(): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const json = process.argv.includes('--json');
    const result = await executeCli(process.argv.slice(2), {
      signal: controller.signal,
      ...(json
        ? {}
        : {
            onProgress(event) {
              process.stderr.write(
                `[${event.sequence}] ${event.type}${event.nodeId ? ` ${event.nodeId}` : ''}\n`,
              );
            },
          }),
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

void main();
