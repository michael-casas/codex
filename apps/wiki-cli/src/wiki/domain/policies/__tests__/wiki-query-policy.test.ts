import assert from 'node:assert/strict';
import { describe, it as test } from 'vitest';

import { WikiError } from '../../errors/wiki.errors.js';
import {
  estimateTokens,
  truncateToTokenBudget,
} from '../context-budget.policy.js';
import { resolveNoteIdentity } from '../note-resolution.policy.js';
import {
  buildFtsQuery,
  normalizeScope,
  trustTier,
} from '../search-query.policy.js';

const NOTES = [
  { path: 'standards/Clean Code.md', title: 'Clean Code' },
  { path: 'skills/Clean Code.md', title: 'Clean Code Practice' },
  { path: 'lessons/BATDD.goal.md', title: 'BATDD Goal Lessons' },
];

// === L1: UNIT TESTS ===

describe('[L1:UNIT] Wiki query policies', () => {
  test('normalizes user text into a bound literal FTS query', () => {
    assert.equal(
      buildFtsQuery(' BATDD "OR" sqlite* '),
      '"BATDD" AND "OR" AND "sqlite"',
    );
    assert.throws(
      () => buildFtsQuery('***'),
      (error) => {
        assert.ok(error instanceof WikiError);
        return error.code === 'USAGE_ERROR';
      },
    );
  });

  test('validates scope and assigns deterministic trust tiers', () => {
    assert.equal(normalizeScope(undefined), 'all');
    assert.equal(normalizeScope('standards'), 'standards');
    assert.equal(trustTier('standards/BATDD.md'), 0);
    assert.equal(trustTier('skills/BATDD.md'), 1);
    assert.equal(trustTier('lessons/BATDD.md'), 2);
    assert.throws(() => normalizeScope('private'), WikiError);
  });

  test('resolves exact path, extensionless path, stem, and unique title', () => {
    assert.equal(
      resolveNoteIdentity(NOTES, 'standards/Clean Code.md').path,
      'standards/Clean Code.md',
    );
    assert.equal(
      resolveNoteIdentity(NOTES, 'standards/Clean Code').path,
      'standards/Clean Code.md',
    );
    assert.equal(
      resolveNoteIdentity(NOTES, 'BATDD.goal').path,
      'lessons/BATDD.goal.md',
    );
    assert.equal(
      resolveNoteIdentity(NOTES, 'Clean Code Practice').path,
      'skills/Clean Code.md',
    );
  });

  test('reports ambiguous stems and missing identities deterministically', () => {
    const ambiguous = resolveNoteIdentity(
      [...NOTES, { path: 'drafts/Clean Code.md', title: 'Draft' }],
      'Clean Code',
    );
    assert.equal(ambiguous.path, null);
    assert.deepEqual(ambiguous.candidates, [
      'drafts/Clean Code.md',
      'skills/Clean Code.md',
      'standards/Clean Code.md',
    ]);
    assert.deepEqual(resolveNoteIdentity(NOTES, 'Unknown'), {
      path: null,
      candidates: [],
    });
  });

  test('estimates and truncates context without exceeding the budget', () => {
    assert.equal(estimateTokens('alpha beta, gamma.'), 5);
    const truncated = truncateToTokenBudget(
      'alpha beta, gamma. delta epsilon',
      4,
    );
    assert.ok(estimateTokens(truncated) <= 4);
    assert.match(truncated, /^alpha beta,? gamma?$/);
    assert.throws(() => truncateToTokenBudget('alpha', 0), WikiError);
  });
});
