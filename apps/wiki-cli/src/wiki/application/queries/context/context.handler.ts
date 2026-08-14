import type { WikiContextResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { ContextQuery } from './context.query.js';
import { buildContextPack } from './internals/context-pack.builder.js';

export function handleContextQuery(
  query: ContextQuery,
  index: WikiIndexRepository,
): WikiContextResult {
  return buildContextPack(query, index);
}
