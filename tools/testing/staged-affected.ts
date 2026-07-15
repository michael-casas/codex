import { execFileSync, spawnSync } from 'node:child_process';

import {
  createAffectedInvocation,
  normalizeGitNameStatus,
} from '../../packages/testing/src/index.js';

const nameStatus = execFileSync(
  'git',
  ['diff', '--cached', '--name-status', '-z', '--find-renames'],
  { encoding: 'utf8' },
);
const files = normalizeGitNameStatus(nameStatus);

if (files.length === 0) {
  console.log('No staged files require Nx affected validation.');
  process.exit(0);
}

const [command, ...args] = createAffectedInvocation(files, [
  'lint',
  'test',
  'typecheck',
]);
if (!command) throw new Error('Affected invocation did not provide a command');

console.log(JSON.stringify({ files, invocationCount: 1 }));
const result = spawnSync(command, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
