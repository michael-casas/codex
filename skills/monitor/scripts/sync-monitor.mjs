#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const codexHome = process.env.CODEX_HOME ?? resolve(process.env.HOME, '.codex');
await import(
  pathToFileURL(
    resolve(codexHome, 'apps/codex-monitor/scripts/sync-monitor.mjs'),
  )
);
