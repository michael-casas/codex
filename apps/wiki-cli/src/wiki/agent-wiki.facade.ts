import { handleReindexCommand } from './application/commands/reindex/index.js';
import { handleBacklinksQuery } from './application/queries/backlinks/index.js';
import { handleContextQuery } from './application/queries/context/index.js';
import { handleDoctorQuery } from './application/queries/doctor/index.js';
import { handleGetNoteQuery } from './application/queries/get-note/index.js';
import { handleLinksQuery } from './application/queries/links/index.js';
import { handleOrphansQuery } from './application/queries/orphans/index.js';
import { handleSearchQuery } from './application/queries/search/index.js';
import { handleStatusQuery } from './application/queries/status/index.js';
import { handleUnresolvedQuery } from './application/queries/unresolved/index.js';
import type {
  WikiBacklinksResult,
  WikiContextResult,
  WikiDoctorResult,
  WikiGetResult,
  WikiLinksResult,
  WikiOrphansResult,
  WikiReindexResult,
  WikiScope,
  WikiSearchResults,
  WikiStatusResult,
  WikiUnresolvedResult,
} from './domain/entities/wiki-note.js';
import { WikiError } from './domain/errors/wiki.errors.js';
import { normalizeScope } from './domain/policies/search-query.policy.js';
import { FilesystemWikiVaultRepository } from './infrastructure/filesystem/filesystem-wiki-vault.repository.js';
import { SqliteWikiIndexRepository } from './infrastructure/persistence/sqlite-wiki-index.repository.js';

const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_CONTEXT_TOKENS = 2_000;

export interface AgentWikiOptions {
  vaultPath: string;
  indexPath: string;
}

export interface AgentWiki {
  status(): Promise<WikiStatusResult>;
  reindex(options?: { full?: boolean }): Promise<WikiReindexResult>;
  get(note: string): Promise<WikiGetResult>;
  search(options: {
    query: string;
    scope?: WikiScope;
    limit?: number;
  }): Promise<WikiSearchResults>;
  links(note: string): Promise<WikiLinksResult>;
  backlinks(note: string): Promise<WikiBacklinksResult>;
  unresolved(): Promise<WikiUnresolvedResult>;
  orphans(): Promise<WikiOrphansResult>;
  context(options: {
    seed: string;
    maxTokens?: number;
  }): Promise<WikiContextResult>;
  doctor(): Promise<WikiDoctorResult>;
  close(): void;
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new WikiError('USAGE_ERROR', `${label} is required`);
  }
  return trimmed;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new WikiError('USAGE_ERROR', `${label} must be a positive integer`);
  }
  return resolved;
}

class DefaultAgentWiki implements AgentWiki {
  private readonly vault: FilesystemWikiVaultRepository;
  private readonly index: SqliteWikiIndexRepository;

  constructor(options: AgentWikiOptions) {
    this.vault = new FilesystemWikiVaultRepository(options.vaultPath);
    this.index = new SqliteWikiIndexRepository(options.indexPath);
  }

  status(): Promise<WikiStatusResult> {
    return handleStatusQuery({}, { vault: this.vault, index: this.index });
  }

  reindex(options: { full?: boolean } = {}): Promise<WikiReindexResult> {
    return handleReindexCommand(
      { full: options.full ?? false },
      { vault: this.vault, index: this.index },
    );
  }

  async get(note: string): Promise<WikiGetResult> {
    return handleGetNoteQuery(
      { note: requiredText(note, 'Note identity') },
      this.index,
    );
  }

  async search(options: {
    query: string;
    scope?: WikiScope;
    limit?: number;
  }): Promise<WikiSearchResults> {
    return handleSearchQuery(
      {
        query: requiredText(options.query, 'Search query'),
        scope: normalizeScope(options.scope),
        limit: positiveInteger(options.limit, DEFAULT_SEARCH_LIMIT, 'Limit'),
      },
      this.index,
    );
  }

  async links(note: string): Promise<WikiLinksResult> {
    return handleLinksQuery(
      { note: requiredText(note, 'Note identity') },
      this.index,
    );
  }

  async backlinks(note: string): Promise<WikiBacklinksResult> {
    return handleBacklinksQuery(
      { note: requiredText(note, 'Note identity') },
      this.index,
    );
  }

  async unresolved(): Promise<WikiUnresolvedResult> {
    return handleUnresolvedQuery({}, this.index);
  }

  async orphans(): Promise<WikiOrphansResult> {
    return handleOrphansQuery({}, this.index);
  }

  async context(options: {
    seed: string;
    maxTokens?: number;
  }): Promise<WikiContextResult> {
    return handleContextQuery(
      {
        seed: requiredText(options.seed, 'Context seed'),
        maxTokens: positiveInteger(
          options.maxTokens,
          DEFAULT_CONTEXT_TOKENS,
          'Token budget',
        ),
      },
      this.index,
    );
  }

  async doctor(): Promise<WikiDoctorResult> {
    return handleDoctorQuery({}, { vault: this.vault, index: this.index });
  }

  close(): void {
    this.index.close();
  }
}

export function openAgentWiki(options: AgentWikiOptions): AgentWiki {
  return new DefaultAgentWiki(options);
}
