import type { WikiScope } from '../../../domain/entities/wiki-note.js';

export interface SearchQuery {
  query: string;
  scope: WikiScope;
  limit: number;
}
