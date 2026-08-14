import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface PortableWikiFixture {
  cleanup(): void;
  codexHome: string;
  digest(): string;
  indexPath: string;
  notePath: string;
  root: string;
  vaultPath: string;
}

function workspaceRoot(): string {
  let current = resolve(process.cwd());
  while (dirname(current) !== current) {
    if (existsSync(join(current, 'nx.json'))) return current;
    current = dirname(current);
  }
  throw new Error('Unable to resolve Nx workspace root');
}

export function createPortableWikiFixture(): PortableWikiFixture {
  const root = mkdtempSync(join(tmpdir(), 'codex-wiki-portable-'));
  const vaultPath = join(root, 'agent-wiki');
  const codexHome = join(root, 'codex-home');
  const notePath = join(vaultPath, 'skills/Portable Tooling.md');
  const indexPath = join(codexHome, '.runtime/wiki/agent-wiki.sqlite');
  mkdirSync(dirname(notePath), { recursive: true });
  writeFileSync(notePath, '# Portable Tooling\nJ5 can retrieve this note.\n', 'utf8');
  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    codexHome,
    digest: () => createHash('sha256').update(readFileSync(notePath)).digest('hex'),
    indexPath,
    notePath,
    root,
    vaultPath,
  };
}

export function runPortableWiki(
  fixture: PortableWikiFixture,
  args: string[],
) {
  return spawnSync(
    process.execPath,
    [join(workspaceRoot(), 'apps/wiki-cli/dist/main.js'), ...args],
    {
      cwd: workspaceRoot(),
      encoding: 'utf8',
      env: {
        ...process.env,
        AGENT_WIKI_HOME: fixture.vaultPath,
        CODEX_HOME: fixture.codexHome,
        WIKI_VAULT: '',
        WIKI_INDEX_PATH: '',
      },
    },
  );
}
