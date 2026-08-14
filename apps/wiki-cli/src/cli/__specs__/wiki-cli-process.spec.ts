import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it as test } from 'vitest';

const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);
const LAUNCHER = path.join(WORKSPACE_ROOT, 'apps/wiki-cli/bin/wiki.mjs');

async function writeNote(
  vaultPath: string,
  relativePath: string,
  markdown: string,
): Promise<void> {
  const notePath = path.join(vaultPath, relativePath);
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, markdown, 'utf8');
}

function runWiki(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [LAUNCHER, ...args], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

async function digest(pathname: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(pathname))
    .digest('hex');
}

// === L2: END-TO-END TESTS ===

describe('[L2:E2E] public wiki process', () => {
  test('executes the ordered JSON workflow through the root launcher', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-cli-process-'));
    const vaultPath = path.join(root, 'vault');
    const batddPath = path.join(vaultPath, 'standards/BATDD.md');
    await writeNote(
      vaultPath,
      'standards/BATDD.md',
      '---\ntype: standard\ntags:\n  - batdd\n---\n# BATDD\nSee [[Clean Code]].\n',
    );
    await writeNote(
      vaultPath,
      'standards/Clean Code.md',
      '---\ntype: standard\ntags:\n  - quality\n---\n# Clean Code\nMinimal verified code.\n',
    );
    const before = await digest(batddPath);
    const env = {
      WIKI_VAULT: vaultPath,
      WIKI_INDEX_PATH: path.join(root, 'index', 'wiki.sqlite'),
    };

    try {
      for (const args of [
        ['reindex', '--json'],
        ['status', '--json'],
        ['search', 'BATDD', '--json'],
        ['get', 'Clean Code', '--json'],
        ['backlinks', 'Clean Code', '--json'],
        ['context', '--seed', 'BATDD', '--max-tokens', '120', '--json'],
        ['doctor', '--json'],
      ]) {
        const result = runWiki(args, env);
        assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
        assert.equal(JSON.parse(result.stdout).ok, true);
      }
      assert.equal(await digest(batddPath), before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('honors --vault over WIKI_VAULT and exposes stable rejection exits', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-cli-errors-'));
    const envVault = path.join(root, 'env-vault');
    const flagVault = path.join(root, 'flag-vault');
    await writeNote(envVault, 'Wrong.md', '# Wrong\n');
    await writeNote(flagVault, 'Right.md', '# Right\n');
    const env = {
      WIKI_VAULT: envVault,
      WIKI_INDEX_PATH: path.join(root, 'wiki.sqlite'),
    };

    try {
      const reindex = runWiki(
        ['reindex', '--full', '--vault', flagVault, '--json'],
        env,
      );
      assert.equal(reindex.status, 0, reindex.stderr);
      assert.equal(JSON.parse(reindex.stdout).vaultPath, flagVault);

      const get = runWiki(
        ['get', 'Right', '--vault', flagVault, '--json'],
        env,
      );
      assert.equal(get.status, 0, get.stderr);
      assert.equal(JSON.parse(get.stdout).note.path, 'Right.md');

      assert.equal(runWiki(['search'], env).status, 2);
      assert.equal(runWiki(['get', 'Missing', '--json'], env).status, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('contains no production reference to an Obsidian executable', async () => {
    const sourcePaths = [
      path.join(WORKSPACE_ROOT, 'apps/wiki-cli/src'),
      path.join(WORKSPACE_ROOT, 'apps/wiki-cli/bin/wiki.mjs'),
    ];
    const files: string[] = [];
    const { readdir } = await import('node:fs/promises');
    async function collect(entry: string): Promise<void> {
      const stat = await (await import('node:fs/promises')).stat(entry);
      if (stat.isFile()) {
        files.push(entry);
        return;
      }
      for (const child of await readdir(entry)) {
        await collect(path.join(entry, child));
      }
    }
    for (const sourcePath of sourcePaths) await collect(sourcePath);

    for (const file of files.filter(
      (entry) => !/__(tests|specs)__/.test(entry),
    )) {
      assert.doesNotMatch(await readFile(file, 'utf8'), /obsidian/i, file);
    }
  });
});
