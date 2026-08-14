import type { WikiBacklinksResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { BacklinksQuery } from './backlinks.query.js';

export function handleBacklinksQuery(
  query: BacklinksQuery,
  index: WikiIndexRepository,
): WikiBacklinksResult {
  return index.backlinks(query.note);
}
