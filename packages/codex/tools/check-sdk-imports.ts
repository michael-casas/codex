import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
  evaluateSdkImportExclusivity,
  type SdkImportScanFile,
} from '../src/policy/sdk-imports.js';

const workspace = resolve(import.meta.dirname, '../../..');
const allowed = 'packages/codex/src/runtime/adapter.ts';
const roots = ['apps', 'packages'];
const files: SdkImportScanFile[] = [];

function scan(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'out-tsc'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    files.push({
      path: relative(workspace, path),
      source: readFileSync(path, 'utf8'),
    });
  }
}

for (const root of roots) scan(join(workspace, root));
const report = evaluateSdkImportExclusivity(files, allowed);
if (report.status === 'failed') {
  console.error(JSON.stringify({ code: 'SDK_IMPORT_EXCLUSIVITY', ...report }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report));
}
