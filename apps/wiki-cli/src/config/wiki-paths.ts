import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function configured(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function expandHome(value: string): string {
  return value === '~'
    ? homedir()
    : value.startsWith('~/')
      ? join(homedir(), value.slice(2))
      : value;
}

export interface WikiPaths {
  indexPath: string;
  vaultPath: string;
}

export function resolveWikiPaths(
  flagVault: string | undefined,
  env: NodeJS.ProcessEnv,
): WikiPaths {
  const codexHome = expandHome(configured(env['CODEX_HOME']) ?? join(homedir(), '.codex'));
  const vault =
    configured(flagVault) ??
    configured(env['AGENT_WIKI_HOME']) ??
    configured(env['WIKI_VAULT']) ??
    join(homedir(), 'Documents', 'vaults', 'Agent Wiki');
  const index =
    configured(env['WIKI_INDEX_PATH']) ??
    join(codexHome, '.runtime', 'wiki', 'agent-wiki.sqlite');
  return {
    vaultPath: resolve(expandHome(vault)),
    indexPath: resolve(expandHome(index)),
  };
}
