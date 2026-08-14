import type { WikiLinksResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { LinksQuery } from './links.query.js';

export function handleLinksQuery(
  query: LinksQuery,
  index: WikiIndexRepository,
): WikiLinksResult {
  return index.links(query.note);
}
