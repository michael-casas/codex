#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`wiki launcher failed: ${result.error.message}\n`);
  process.exitCode = 2;
} else {
  process.exitCode = result.status ?? 2;
}
