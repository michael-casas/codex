import type { WikiUnresolvedResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { UnresolvedQuery } from './unresolved.query.js';

export function handleUnresolvedQuery(
  _query: UnresolvedQuery,
  index: WikiIndexRepository,
): WikiUnresolvedResult {
  return index.unresolved();
}
