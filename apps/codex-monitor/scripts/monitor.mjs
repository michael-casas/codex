#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(
  'bun',
  [
    fileURLToPath(new URL('./monitor.ts', import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('error', (error) => {
  throw error;
});
process.exitCode = await new Promise((resolve) =>
  child.once('close', (code) => resolve(code ?? 1)),
);
