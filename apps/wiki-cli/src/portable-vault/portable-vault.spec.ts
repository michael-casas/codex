import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createPortableWikiFixture, runPortableWiki } from './support/driver.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

describe('[L2:INTEGRATION] public wiki process configuration', () => {
  it('WIKI-PROCESS-001 resolves only AGENT_WIKI_HOME and CODEX_HOME', () => {
    const fixture = createPortableWikiFixture();
    try {
      const before = fixture.digest();
      const reindex = runPortableWiki(fixture, ['reindex', '--json']);
      expect(reindex.status, reindex.stderr).toBe(0);
      expect(JSON.parse(reindex.stdout).vaultPath).toBe(fixture.vaultPath);
      expect(existsSync(fixture.indexPath)).toBe(true);
      expect(fixture.digest()).toBe(before);
    } finally {
      fixture.cleanup();
    }
  });
});

// === L2: END-TO-END TESTS ===

describe('[L2:E2E] public wiki retrieval', () => {
  it('reindexes, searches, and gets a note from the cloned vault', () => {
    const fixture = createPortableWikiFixture();
    try {
      for (const args of [
        ['reindex', '--json'],
        ['search', 'Portable', '--json'],
        ['get', 'Portable Tooling', '--json'],
      ]) {
        const result = runPortableWiki(fixture, args);
        expect(result.status, `${args.join(' ')}: ${result.stderr}`).toBe(0);
        expect(JSON.parse(result.stdout).ok).toBe(true);
      }
    } finally {
      fixture.cleanup();
    }
  });
});
