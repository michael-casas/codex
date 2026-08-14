import type { WikiScope } from '../entities/wiki-note.js';
import { WikiError } from '../errors/wiki.errors.js';

const SEARCH_TOKEN = /[\p{L}\p{N}_-]+/gu;

export function buildFtsQuery(input: string): string {
  const tokens = input.match(SEARCH_TOKEN) ?? [];
  if (tokens.length === 0) {
    throw new WikiError('USAGE_ERROR', 'Search query must contain a word');
  }
  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' AND ');
}

export function normalizeScope(scope: string | undefined): WikiScope {
  if (scope === undefined || scope === 'all') return 'all';
  if (scope === 'standards' || scope === 'skills') return scope;
  throw new WikiError(
    'USAGE_ERROR',
    'Scope must be one of standards, skills, or all',
  );
}

export function trustTier(notePath: string): number {
  if (notePath.startsWith('standards/')) return 0;
  if (notePath.startsWith('skills/')) return 1;
  return 2;
}
