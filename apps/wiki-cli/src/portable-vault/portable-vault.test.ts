import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveWikiPaths } from '../config/wiki-paths.js';

// === L1: UNIT TESTS ===

describe('[L1:UNIT] portable Wiki path resolution', () => {
  it('WIKI-PATH-001 gives --vault precedence over both environment variables', () => {
    expect(
      resolveWikiPaths('/flag', {
        AGENT_WIKI_HOME: '/agent-home',
        WIKI_VAULT: '/legacy',
        CODEX_HOME: '/codex',
      }).vaultPath,
    ).toBe('/flag');
  });

  it('WIKI-PATH-002 gives AGENT_WIKI_HOME precedence over WIKI_VAULT', () => {
    expect(
      resolveWikiPaths(undefined, {
        AGENT_WIKI_HOME: '/agent-home',
        WIKI_VAULT: '/legacy',
        CODEX_HOME: '/codex',
      }).vaultPath,
    ).toBe('/agent-home');
  });

  it('WIKI-PATH-003 places the default index in CODEX_HOME runtime state', () => {
    expect(
      resolveWikiPaths(undefined, {
        AGENT_WIKI_HOME: '/agent-home',
        CODEX_HOME: '/portable/codex',
      }).indexPath,
    ).toBe(join('/portable/codex', '.runtime/wiki/agent-wiki.sqlite'));
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===

describe('[L1:INTEGRATION] legacy compatibility', () => {
  it('retains WIKI_VAULT and WIKI_INDEX_PATH when canonical variables are absent', () => {
    expect(
      resolveWikiPaths(undefined, {
        WIKI_VAULT: '/legacy',
        WIKI_INDEX_PATH: '/legacy/index.sqlite',
      }),
    ).toMatchObject({
      vaultPath: '/legacy',
      indexPath: '/legacy/index.sqlite',
    });
  });
});
