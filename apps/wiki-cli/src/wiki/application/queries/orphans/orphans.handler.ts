import type { WikiOrphansResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { OrphansQuery } from './orphans.query.js';

export function handleOrphansQuery(
  _query: OrphansQuery,
  index: WikiIndexRepository,
): WikiOrphansResult {
  return index.orphans();
}
