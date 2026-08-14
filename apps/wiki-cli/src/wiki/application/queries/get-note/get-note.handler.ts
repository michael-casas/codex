import type { WikiGetResult } from '../../../domain/entities/wiki-note.js';
import type { WikiIndexRepository } from '../../../domain/repositories/wiki-index.repository.js';
import type { GetNoteQuery } from './get-note.query.js';

export function handleGetNoteQuery(
  query: GetNoteQuery,
  index: WikiIndexRepository,
): WikiGetResult {
  return index.get(query.note);
}
