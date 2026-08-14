import type { ParsedWikiNote } from '../entities/wiki-note.js';

export interface WikiVaultRepository {
  readonly vaultPath: string;
  exists(): boolean;
  canonicalPath(): string;
  latestMarkdownMtimeMs(): Promise<number | null>;
  readAllNotes(): Promise<ParsedWikiNote[]>;
}
