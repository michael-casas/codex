import type { WikiSearchResults } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { SearchQuery } from './search.query.js';

export function handleSearchQuery(
  query: SearchQuery,
  index: WikiIndexRepository,
): WikiSearchResults {
  return index.search(query);
}
