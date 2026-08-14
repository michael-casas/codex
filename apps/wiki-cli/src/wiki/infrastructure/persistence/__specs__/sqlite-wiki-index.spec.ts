import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, it as test } from 'vitest';

import Database from 'better-sqlite3';

import { openAgentWiki, WikiError } from '../../../index.js';

async function writeNote(
  vaultPath: string,
  relativePath: string,
  markdown: string,
): Promise<void> {
  const notePath = path.join(vaultPath, relativePath);
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, markdown, 'utf8');
}

async function vaultDigest(vaultPath: string): Promise<string> {
  const files = [
    'standards/BATDD.md',
    'standards/Clean Code.md',
    'skills/Practice.md',
    'lessons/Orphan.md',
  ];
  const hash = createHash('sha256');
  for (const file of files) {
    try {
      hash.update(file);
      hash.update(await readFile(path.join(vaultPath, file)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return hash.digest('hex');
}

async function createFixture(root: string): Promise<string> {
  const vaultPath = path.join(root, 'vault');
  await writeNote(
    vaultPath,
    'standards/BATDD.md',
    `---\ntype: standard\nstatus: active\ntags:\n  - batdd\n---\n# BATDD\nBehavior acceptance test driven development. See [[Clean Code]].\n`,
  );
  await writeNote(
    vaultPath,
    'standards/Clean Code.md',
    `---\ntype: standard\nstatus: active\ntags:\n  - quality\n---\n# Clean Code\nMinimum code behind a narrow interface.\n`,
  );
  await writeNote(
    vaultPath,
    'skills/Practice.md',
    `---\ntype: skill\nstatus: active\ntags:\n  - practice\n---\n# Practice\nUse [[Clean Code]] and [[Missing Standard]].\n`,
  );
  await writeNote(
    vaultPath,
    'lessons/Orphan.md',
    `---\ntype: lessons\nstatus: active\ntags: []\n---\n# Orphan\nNo graph relationships.\n`,
  );
  return vaultPath;
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

describe('[L2:INTEGRATION] SQLite Wiki index', () => {
  test('indexes a real vault and serves search, get, graph, and diagnostics', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-basic-'));
    const vaultPath = await createFixture(root);
    const indexPath = path.join(root, 'index', 'wiki.sqlite');
    const before = await vaultDigest(vaultPath);
    const wiki = openAgentWiki({ vaultPath, indexPath });

    try {
      const beforeStatus = await wiki.status();
      assert.equal(beforeStatus.indexExists, false);
      assert.equal(beforeStatus.noteCount, 0);

      const reindex = await wiki.reindex({ full: true });
      assert.equal(reindex.discovered, 4);
      assert.equal(reindex.indexed, 4);
      assert.equal(reindex.unresolved, 1);

      const search = await wiki.search({
        query: 'behavior acceptance',
        scope: 'all',
        limit: 5,
      });
      assert.equal(search.results[0]?.path, 'standards/BATDD.md');

      const get = await wiki.get('Clean Code');
      assert.equal(get.note.frontmatter['type'], 'standard');
      assert.match(get.note.markdown, /Minimum code/);

      const links = await wiki.links('BATDD');
      assert.equal(links.links[0]?.targetPath, 'standards/Clean Code.md');
      const backlinks = await wiki.backlinks('Clean Code');
      assert.deepEqual(
        backlinks.backlinks.map((link) => link.sourcePath),
        ['skills/Practice.md', 'standards/BATDD.md'],
      );

      const unresolved = await wiki.unresolved();
      assert.equal(unresolved.unresolved[0]?.target, 'Missing Standard');
      const orphans = await wiki.orphans();
      assert.ok(
        orphans.orphans.some((note) => note.path === 'lessons/Orphan.md'),
      );
      const doctor = await wiki.doctor();
      assert.equal(doctor.healthy, false);
      assert.equal(doctor.unresolvedCount, 1);
      assert.equal(await vaultDigest(vaultPath), before);
    } finally {
      wiki.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('refreshes changed and deleted notes incrementally', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-update-'));
    const vaultPath = await createFixture(root);
    const indexPath = path.join(root, 'wiki.sqlite');
    const wiki = openAgentWiki({ vaultPath, indexPath });

    try {
      await wiki.reindex({ full: true });
      await writeNote(
        vaultPath,
        'standards/BATDD.md',
        '# BATDD\nBehavior acceptance with a newly indexed phrase.\n',
      );
      await rm(path.join(vaultPath, 'skills/Practice.md'));

      const refresh = await wiki.reindex();
      assert.equal(refresh.indexed, 1);
      assert.equal(refresh.removed, 1);
      assert.equal(refresh.unchanged, 2);
      assert.equal(
        (await wiki.search({ query: 'newly indexed' })).results[0]?.path,
        'standards/BATDD.md',
      );
      await assert.rejects(
        () => wiki.get('Practice'),
        (error) => {
          assert.ok(error instanceof WikiError);
          return error.code === 'NOTE_NOT_FOUND';
        },
      );
    } finally {
      wiki.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects a mismatched vault unless full reindex replaces the projection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-vault-'));
    const firstVault = await createFixture(path.join(root, 'first'));
    const secondVault = path.join(root, 'second', 'vault');
    await writeNote(secondVault, 'standards/Other.md', '# Other\n');
    const indexPath = path.join(root, 'wiki.sqlite');
    const first = openAgentWiki({ vaultPath: firstVault, indexPath });

    try {
      await first.reindex({ full: true });
    } finally {
      first.close();
    }

    const second = openAgentWiki({ vaultPath: secondVault, indexPath });
    try {
      await assert.rejects(
        () => second.reindex(),
        (error) => {
          assert.ok(error instanceof WikiError);
          return error.code === 'INDEX_VAULT_MISMATCH';
        },
      );
      const rebuilt = await second.reindex({ full: true });
      assert.equal(rebuilt.discovered, 1);
      assert.equal((await second.get('Other')).note.path, 'standards/Other.md');
    } finally {
      second.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('skips symlinks escaping the vault and treats malformed FTS as literals', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-safe-'));
    const vaultPath = await createFixture(root);
    const outside = path.join(root, 'outside.md');
    await writeFile(outside, '# Secret outside\n', 'utf8');
    await symlink(outside, path.join(vaultPath, 'escaped.md'));
    const wiki = openAgentWiki({
      vaultPath,
      indexPath: path.join(root, 'wiki.sqlite'),
    });

    try {
      const reindex = await wiki.reindex({ full: true });
      assert.equal(reindex.discovered, 4);
      assert.deepEqual((await wiki.search({ query: '" OR *' })).results, []);
    } finally {
      wiki.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('doctor reports missing vault and unsupported schema as unhealthy', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-doctor-'));
    const missingVault = path.join(root, 'missing-vault');
    const missingIndex = path.join(root, 'missing.sqlite');
    const missing = openAgentWiki({
      vaultPath: missingVault,
      indexPath: missingIndex,
    });

    try {
      const result = await missing.doctor();
      assert.equal(result.healthy, false);
      assert.ok(result.issues.some((issue) => /vault/i.test(issue)));
      assert.ok(result.issues.some((issue) => /index/i.test(issue)));
    } finally {
      missing.close();
    }

    const vaultPath = await createFixture(root);
    const invalidIndex = path.join(root, 'invalid.sqlite');
    const database = new Database(invalidIndex);
    database.exec(
      "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO metadata VALUES ('schema_version', '999')",
    );
    database.close();
    const invalid = openAgentWiki({ vaultPath, indexPath: invalidIndex });
    try {
      const result = await invalid.doctor();
      assert.equal(result.healthy, false);
      assert.ok(result.issues.some((issue) => /unsupported/i.test(issue)));
    } finally {
      invalid.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects a non-directory vault with an owned error and no index write', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'wiki-index-invalid-vault-'),
    );
    const vaultPath = path.join(root, 'not-a-directory');
    const indexPath = path.join(root, 'wiki.sqlite');
    await writeFile(vaultPath, 'not a vault', 'utf8');
    const wiki = openAgentWiki({ vaultPath, indexPath });

    try {
      await assert.rejects(
        () => wiki.reindex(),
        (error) => {
          assert.ok(error instanceof WikiError);
          return error.code === 'VAULT_NOT_FOUND';
        },
      );
      assert.equal(existsSync(indexPath), false);
    } finally {
      wiki.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test('full reindex reports only notes actually removed from the vault', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wiki-index-full-count-'));
    const vaultPath = await createFixture(root);
    const wiki = openAgentWiki({
      vaultPath,
      indexPath: path.join(root, 'wiki.sqlite'),
    });

    try {
      await wiki.reindex({ full: true });
      const repeated = await wiki.reindex({ full: true });
      assert.equal(repeated.removed, 0);
    } finally {
      wiki.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
