import assert from 'node:assert/strict';
import { describe, it as test } from 'vitest';

import { parseMarkdownNote } from '../markdown-note.parser.js';

const MARKDOWN = `---
type: standard
status: active
title: Contract Law
tags:
  - standards
  - batdd
canonical: true
version: 2
---

# Different H1

## Rules & Safety

See [[Clean Code]], [[standards/BATDD#Meaningful RED|BATDD law]], and [[Missing]].
`;

// === L1: UNIT TESTS ===

describe('[L1:UNIT] Markdown note parser', () => {
  test('parses frontmatter, title, tags, and preserves complete Markdown', () => {
    const note = parseMarkdownNote({
      relativePath: 'standards/Contract Law.md',
      markdown: MARKDOWN,
      mtimeMs: 123,
      size: Buffer.byteLength(MARKDOWN),
    });

    assert.equal(note.path, 'standards/Contract Law.md');
    assert.equal(note.title, 'Contract Law');
    assert.deepEqual(note.tags, ['standards', 'batdd']);
    assert.equal(note.frontmatter['canonical'], true);
    assert.equal(note.frontmatter['version'], 2);
    assert.equal(note.markdown, MARKDOWN);
    assert.match(note.body, /^\n# Different H1/m);
    assert.equal(note.hash.length, 64);
  });

  test('extracts headings and deterministic anchors', () => {
    const note = parseMarkdownNote({
      relativePath: 'Contract.md',
      markdown: MARKDOWN,
      mtimeMs: 0,
      size: MARKDOWN.length,
    });

    assert.deepEqual(note.headings, [
      { level: 1, text: 'Different H1', anchor: 'different-h1' },
      { level: 2, text: 'Rules & Safety', anchor: 'rules-safety' },
    ]);
  });

  test('extracts bare, path-qualified, fragmented, and aliased wikilinks', () => {
    const note = parseMarkdownNote({
      relativePath: 'Contract.md',
      markdown: MARKDOWN,
      mtimeMs: 0,
      size: MARKDOWN.length,
    });

    assert.deepEqual(note.links, [
      { target: 'Clean Code', fragment: null, label: null },
      {
        target: 'standards/BATDD',
        fragment: 'Meaningful RED',
        label: 'BATDD law',
      },
      { target: 'Missing', fragment: null, label: null },
    ]);
  });

  test('falls back from frontmatter title to H1 and then filename stem', () => {
    const h1 = parseMarkdownNote({
      relativePath: 'skills/file-name.md',
      markdown: '# Human Title\n',
      mtimeMs: 0,
      size: 14,
    });
    const stem = parseMarkdownNote({
      relativePath: 'skills/file-name.md',
      markdown: 'Body only\n',
      mtimeMs: 0,
      size: 10,
    });

    assert.equal(h1.title, 'Human Title');
    assert.equal(stem.title, 'file-name');
  });
});
