import assert from 'node:assert/strict';
import { describe, it as test } from 'vitest';

import {
  WikiError,
  type AgentWiki,
  type WikiSearchResults,
} from '../../wiki/index.js';

import { runWikiCli } from '../wiki-cli.controller.js';

function createWiki(overrides: Partial<AgentWiki> = {}): AgentWiki {
  const notExpected = async (): Promise<never> => {
    throw new Error('unexpected facade call');
  };
  return {
    status: notExpected,
    reindex: notExpected,
    get: notExpected,
    search: notExpected,
    links: notExpected,
    backlinks: notExpected,
    unresolved: notExpected,
    orphans: notExpected,
    context: notExpected,
    doctor: notExpected,
    close: () => undefined,
    ...overrides,
  };
}

// === L1: IN-PROCESS INTEGRATION TESTS ===

describe('[L1:INTEGRATION] wiki CLI controller', () => {
  test('prints help with commands, defaults, and trust order', async () => {
    let stdout = '';
    const exitCode = await runWikiCli(['--help'], {
      stdout: (text) => {
        stdout += text;
      },
    });

    assert.equal(exitCode, 0);
    assert.match(stdout, /wiki status/);
    assert.match(stdout, /reindex \[--full\]/);
    assert.match(stdout, /standards.*skills.*rest/is);
    assert.match(stdout, /AGENT_WIKI_HOME/);
  });

  test('validates argv before opening the facade', async () => {
    let opened = false;
    let stderr = '';
    const exitCode = await runWikiCli(['search', '--scope', 'private'], {
      openWiki: () => {
        opened = true;
        return createWiki();
      },
      stderr: (text) => {
        stderr += text;
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(opened, false);
    assert.match(stderr, /scope/i);
  });

  test('applies flag over environment configuration and renders one JSON value', async () => {
    const calls: unknown[] = [];
    let closed = false;
    let stdout = '';
    const searchResult: WikiSearchResults = {
      ok: true,
      query: 'BATDD',
      scope: 'standards',
      limit: 3,
      results: [],
    };
    const exitCode = await runWikiCli(
      [
        'search',
        'BATDD',
        '--scope',
        'standards',
        '-k',
        '3',
        '--vault',
        '/flag-vault',
        '--json',
      ],
      {
        env: {
          WIKI_VAULT: '/env-vault',
          WIKI_INDEX_PATH: '/tmp/wiki.sqlite',
        },
        openWiki: (options) => {
          calls.push(options);
          return createWiki({
            search: async (options) => {
              calls.push(options);
              return searchResult;
            },
            close: () => {
              closed = true;
            },
          });
        },
        stdout: (text) => {
          stdout += text;
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
      { vaultPath: '/flag-vault', indexPath: '/tmp/wiki.sqlite' },
      { query: 'BATDD', scope: 'standards', limit: 3 },
    ]);
    assert.deepEqual(JSON.parse(stdout), searchResult);
    assert.equal(closed, true);
  });

  test('maps operational failures to exit 1 and a stable JSON error envelope', async () => {
    let stderr = '';
    const exitCode = await runWikiCli(['get', 'Missing', '--json'], {
      openWiki: () =>
        createWiki({
          get: async () => {
            throw new WikiError('NOTE_NOT_FOUND', 'Note not found: Missing');
          },
        }),
      stderr: (text) => {
        stderr += text;
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stderr), {
      ok: false,
      error: {
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found: Missing',
        candidates: [],
      },
    });
  });
});
