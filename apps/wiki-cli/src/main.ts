#!/usr/bin/env node

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWikiCli } from './cli/wiki-cli.controller.js';

function isMainModule(): boolean {
  return (
    Boolean(process.argv[1]) &&
    path.resolve(process.argv[1] as string) === fileURLToPath(import.meta.url)
  );
}

export { runWikiCli } from './cli/wiki-cli.controller.js';

if (isMainModule()) {
  runWikiCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stderr.write('wiki command failed\n');
      process.exitCode = 1;
    });
}
