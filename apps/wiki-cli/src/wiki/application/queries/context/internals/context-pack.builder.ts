import type {
  WikiContextResult,
  WikiGetResult,
  WikiNoteSummary,
} from '../../../../domain/entities/wiki-note.js';
import { WikiError } from '../../../../domain/errors/wiki.errors.js';
import {
  estimateTokens,
  truncateToTokenBudget,
} from '../../../../domain/policies/context-budget.policy.js';
import type { WikiIndexRepository } from '../../../../domain/repositories/wiki-index.repository.js';
import type { ContextQuery } from '../context.query.js';

function resolveSeed(
  query: ContextQuery,
  index: WikiIndexRepository,
): WikiGetResult {
  try {
    return index.get(query.seed);
  } catch (error) {
    if (!(error instanceof WikiError) || error.code !== 'NOTE_NOT_FOUND') {
      throw error;
    }
  }
  const first = index.search({ query: query.seed, scope: 'all', limit: 1 })
    .results[0];
  if (!first) {
    throw new WikiError(
      'NOTE_NOT_FOUND',
      `No Wiki context found: ${query.seed}`,
    );
  }
  return index.get(first.path);
}

function candidatePaths(
  seed: WikiNoteSummary,
  query: ContextQuery,
  index: WikiIndexRepository,
): string[] {
  const paths = [seed.path];
  paths.push(
    ...index
      .links(seed.path)
      .links.flatMap((link) => (link.targetPath ? [link.targetPath] : [])),
    ...index.backlinks(seed.path).backlinks.map((link) => link.sourcePath),
  );
  try {
    paths.push(
      ...index
        .search({ query: query.seed, scope: 'all', limit: 10 })
        .results.map((result) => result.path),
    );
  } catch (error) {
    if (!(error instanceof WikiError) || error.code !== 'USAGE_ERROR')
      throw error;
  }
  return [...new Set(paths)];
}

export function buildContextPack(
  query: ContextQuery,
  index: WikiIndexRepository,
): WikiContextResult {
  const seedResult = resolveSeed(query, index);
  const sources: WikiContextResult['sources'] = [];
  let context = '';

  for (const notePath of candidatePaths(seedResult.note, query, index)) {
    const note = index.get(notePath).note;
    const prefix = `${context ? '\n\n' : ''}## [[${note.path}]] — ${note.title}\n\n`;
    const remaining =
      query.maxTokens - estimateTokens(context) - estimateTokens(prefix);
    if (remaining < 1) break;
    const content = truncateToTokenBudget(note.body.trim(), remaining);
    if (!content) continue;
    const block = `${prefix}${content}`;
    context += block;
    sources.push({
      path: note.path,
      title: note.title,
      content,
      estimatedTokens: estimateTokens(block),
    });
  }

  return {
    ok: true,
    seed: {
      path: seedResult.note.path,
      title: seedResult.note.title,
      type: seedResult.note.type,
      status: seedResult.note.status,
      tags: seedResult.note.tags,
    },
    maxTokens: query.maxTokens,
    estimatedTokens: estimateTokens(context),
    context,
    sources,
  };
}
