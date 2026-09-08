import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(pluginRoot, '../..');
const root = await mkdtemp(join(tmpdir(), 'codex-control-generator-'));
const marketplace = join(root, '.agents/plugins/marketplace.json');
const homeMarketplace = resolve(
  process.env['HOME'] ?? '/nonexistent',
  '.agents/plugins/marketplace.json',
);
const digest = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const optionalDigest = async (path: string) =>
  lstat(path)
    .then(() => digest(path))
    .catch(() => undefined);

try {
  const homeBefore = await optionalDigest(homeMarketplace);
  await writeFile(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  );
  await writeFile(join(root, 'nx.json'), '{}\n');
  await mkdir(join(root, 'node_modules/@codex'), { recursive: true });
  await symlink(
    join(workspaceRoot, 'node_modules/nx'),
    join(root, 'node_modules/nx'),
  );
  await symlink(
    pluginRoot,
    join(root, 'node_modules/@codex/plugin-codex-control'),
  );
  const nx = join(workspaceRoot, 'node_modules/.bin/nx');
  const run = () =>
    execute(
      nx,
      ['generate', '@codex/plugin-codex-control:init', '--no-interactive'],
      { cwd: root },
    );
  await run();
  const first = await digest(marketplace);
  await run();
  const second = await digest(marketplace);
  if (first !== second)
    throw new Error('CODEX_CONTROL_GENERATOR_NOT_IDEMPOTENT');
  if ((await optionalDigest(homeMarketplace)) !== homeBefore)
    throw new Error('CODEX_CONTROL_GENERATOR_HOME_MUTATION');
  process.stdout.write(
    `${JSON.stringify({ status: 'PASS', runs: 2, marketplaceSha256: second })}\n`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
