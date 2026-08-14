import type {
  ParsedWikiNote,
  WikiBacklinksResult,
  WikiDoctorResult,
  WikiGetResult,
  WikiLinksResult,
  WikiOrphansResult,
  WikiReindexResult,
  WikiScope,
  WikiSearchResults,
  WikiStatusResult,
  WikiUnresolvedResult,
} from '../entities/wiki-note.js';

export interface WikiIndexStatus {
  indexExists: boolean;
  indexedVaultPath: string | null;
  noteCount: number;
  lastIndexedAt: string | null;
  schemaVersion: number | null;
}

export interface WikiIndexRepository {
  readonly indexPath: string;
  inspect(): WikiIndexStatus;
  replaceProjection(options: {
    notes: ParsedWikiNote[];
    vaultPath: string;
    full: boolean;
  }): WikiReindexResult;
  get(note: string): WikiGetResult;
  search(options: {
    query: string;
    scope: WikiScope;
    limit: number;
  }): WikiSearchResults;
  links(note: string): WikiLinksResult;
  backlinks(note: string): WikiBacklinksResult;
  unresolved(): WikiUnresolvedResult;
  orphans(): WikiOrphansResult;
  doctor(vaultPath: string): WikiDoctorResult;
  close(): void;
}

export type { WikiStatusResult };
