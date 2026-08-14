import { WikiError } from '../errors/wiki.errors.js';

const TOKEN = /[\p{L}\p{N}_-]+|[^\s\p{L}\p{N}_-]/gu;

export function estimateTokens(content: string): number {
  return content.match(TOKEN)?.length ?? 0;
}

export function truncateToTokenBudget(
  content: string,
  maxTokens: number,
): string {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new WikiError(
      'USAGE_ERROR',
      'Token budget must be a positive integer',
    );
  }
  const matches = [...content.matchAll(TOKEN)];
  if (matches.length <= maxTokens) return content;
  const last = matches[maxTokens - 1];
  if (!last || last.index === undefined) return '';
  return content.slice(0, last.index + last[0].length).trimEnd();
}
