import { existsSync } from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

import type {
  FrontmatterValue,
  ParsedWikiNote,
  WikiBacklinksResult,
  WikiDoctorResult,
  WikiGetResult,
  WikiGraphLink,
  WikiLinksResult,
  WikiNote,
  WikiNoteSummary,
  WikiOrphansResult,
  WikiReindexResult,
  WikiScope,
  WikiSearchResult,
  WikiSearchResults,
  WikiUnresolvedResult,
} from '../../domain/entities/wiki-note.js';
import { WikiError } from '../../domain/errors/wiki.errors.js';
import { resolveNoteIdentity } from '../../domain/policies/note-resolution.policy.js';
import { buildFtsQuery } from '../../domain/policies/search-query.policy.js';
import type {
  WikiIndexRepository,
  WikiIndexStatus,
} from '../../domain/repositories/wiki-index.repository.js';
import {
  assertWikiIndexSchema,
  metadataValue,
  openWritableWikiIndex,
} from './internals/sqlite-index.schema.js';
import { writeWikiProjection } from './internals/sqlite-projection.writer.js';

interface StoredNoteRow {
  path: string;
  title: string;
  type: string | null;
  status: string | null;
  tags_json: string;
  frontmatter_json: string;
  body: string;
  markdown: string;
  hash: string;
  mtime_ms: number;
  size: number;
  indexed_at: string;
  trust_tier: number;
}

interface StoredLinkRow {
  source_path: string;
  target_text: string;
  target_fragment: string | null;
  label: string | null;
  target_path: string | null;
  ambiguous: number;
}

interface SearchRow extends StoredNoteRow {
  score: number;
  snippet: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function noteSummary(row: StoredNoteRow): WikiNoteSummary {
  return {
    path: row.path,
    title: row.title,
    type: row.type,
    status: row.status,
    tags: parseJson<string[]>(row.tags_json, []),
  };
}

function fullNote(database: Database.Database, row: StoredNoteRow): WikiNote {
  const headings = database
    .prepare(
      'SELECT level, text, anchor FROM headings WHERE note_path = ? ORDER BY id',
    )
    .all(row.path) as WikiNote['headings'];
  return {
    ...noteSummary(row),
    frontmatter: parseJson<Record<string, FrontmatterValue>>(
      row.frontmatter_json,
      {},
    ),
    body: row.body,
    markdown: row.markdown,
    headings,
  };
}

function graphLink(row: StoredLinkRow): WikiGraphLink {
  return {
    sourcePath: row.source_path,
    target: row.target_text,
    targetPath: row.target_path,
    fragment: row.target_fragment,
    label: row.label,
    resolved: row.target_path !== null,
    ambiguous: row.ambiguous === 1,
  };
}

export class SqliteWikiIndexRepository implements WikiIndexRepository {
  readonly indexPath: string;

  constructor(indexPath: string) {
    this.indexPath = path.resolve(indexPath);
  }

  inspect(): WikiIndexStatus {
    if (!existsSync(this.indexPath)) {
      return {
        indexExists: false,
        indexedVaultPath: null,
        noteCount: 0,
        lastIndexedAt: null,
        schemaVersion: null,
      };
    }
    return this.withReadableDatabase((database) => {
      const schemaVersion = assertWikiIndexSchema(database);
      const noteCount = (
        database.prepare('SELECT COUNT(*) AS count FROM notes').get() as {
          count: number;
        }
      ).count;
      return {
        indexExists: true,
        indexedVaultPath: metadataValue(database, 'vault_path'),
        noteCount,
        lastIndexedAt: metadataValue(database, 'last_indexed_at'),
        schemaVersion,
      };
    });
  }

  replaceProjection(options: {
    notes: ParsedWikiNote[];
    vaultPath: string;
    full: boolean;
  }): WikiReindexResult {
    const database = openWritableWikiIndex(this.indexPath);
    try {
      return writeWikiProjection(database, this.indexPath, options);
    } catch (error) {
      if (error instanceof WikiError) throw error;
      throw new WikiError('INDEX_ERROR', 'Failed to update Wiki index', [], {
        cause: error,
      });
    } finally {
      database.close();
    }
  }

  get(note: string): WikiGetResult {
    return this.withReadableDatabase((database) => {
      const notePath = this.resolvePath(database, note);
      const row = database
        .prepare('SELECT * FROM notes WHERE path = ?')
        .get(notePath) as StoredNoteRow;
      return { ok: true, note: fullNote(database, row) };
    });
  }

  search(options: {
    query: string;
    scope: WikiScope;
    limit: number;
  }): WikiSearchResults {
    const ftsQuery = buildFtsQuery(options.query);
    return this.withReadableDatabase((database) => {
      const prefix = options.scope === 'all' ? '%' : `${options.scope}/%`;
      const rows = database
        .prepare(
          `SELECT n.*, snippet(notes_fts, 2, '', '', ' … ', 24) AS snippet,
                  bm25(notes_fts) + (n.trust_tier * 0.05) AS score
             FROM notes_fts
             JOIN notes n ON n.path = notes_fts.path
            WHERE notes_fts MATCH ?
              AND (? = 'all' OR n.path LIKE ?)
            ORDER BY score ASC, n.path ASC
            LIMIT ?`,
        )
        .all(ftsQuery, options.scope, prefix, options.limit) as SearchRow[];
      const results: WikiSearchResult[] = rows.map((row) => ({
        ...noteSummary(row),
        score: row.score,
        snippet: row.snippet,
      }));
      return {
        ok: true,
        query: options.query,
        scope: options.scope,
        limit: options.limit,
        results,
      };
    });
  }

  links(note: string): WikiLinksResult {
    return this.withReadableDatabase((database) => {
      const notePath = this.resolvePath(database, note);
      const row = database
        .prepare('SELECT * FROM notes WHERE path = ?')
        .get(notePath) as StoredNoteRow;
      const links = database
        .prepare(
          `SELECT source_path, target_text, target_fragment, label, target_path, ambiguous
             FROM links WHERE source_path = ? ORDER BY id`,
        )
        .all(notePath) as StoredLinkRow[];
      return { ok: true, note: noteSummary(row), links: links.map(graphLink) };
    });
  }

  backlinks(note: string): WikiBacklinksResult {
    return this.withReadableDatabase((database) => {
      const notePath = this.resolvePath(database, note);
      const row = database
        .prepare('SELECT * FROM notes WHERE path = ?')
        .get(notePath) as StoredNoteRow;
      const backlinks = database
        .prepare(
          `SELECT source_path, target_text, target_fragment, label, target_path, ambiguous
             FROM links WHERE target_path = ? ORDER BY source_path, id`,
        )
        .all(notePath) as StoredLinkRow[];
      return {
        ok: true,
        note: noteSummary(row),
        backlinks: backlinks.map(graphLink),
      };
    });
  }

  unresolved(): WikiUnresolvedResult {
    return this.withReadableDatabase((database) => {
      const rows = database
        .prepare(
          `SELECT source_path, target_text, target_fragment, label, target_path, ambiguous
             FROM links WHERE target_path IS NULL ORDER BY source_path, target_text, id`,
        )
        .all() as StoredLinkRow[];
      return { ok: true, unresolved: rows.map(graphLink) };
    });
  }

  orphans(): WikiOrphansResult {
    return this.withReadableDatabase((database) => {
      const rows = database
        .prepare(
          `SELECT n.* FROM notes n
            WHERE NOT EXISTS (SELECT 1 FROM links outgoing WHERE outgoing.source_path = n.path)
              AND NOT EXISTS (SELECT 1 FROM links incoming WHERE incoming.target_path = n.path)
            ORDER BY n.path`,
        )
        .all() as StoredNoteRow[];
      return { ok: true, orphans: rows.map(noteSummary) };
    });
  }

  doctor(vaultPath: string): WikiDoctorResult {
    let status: WikiIndexStatus;
    try {
      status = this.inspect();
    } catch (error) {
      const message =
        error instanceof WikiError
          ? error.message
          : 'Wiki index cannot be read';
      return this.unhealthyDoctorResult(vaultPath, message);
    }
    if (!status.indexExists) {
      return this.unhealthyDoctorResult(
        vaultPath,
        'Index does not exist; run wiki reindex',
      );
    }

    const issues: string[] = [];
    if (status.indexedVaultPath !== vaultPath) {
      issues.push(
        `Index belongs to ${status.indexedVaultPath ?? 'an unknown vault'}`,
      );
    }
    const unresolved = this.unresolved().unresolved;
    if (unresolved.length > 0) {
      issues.push(`${unresolved.length} unresolved Wiki link(s)`);
    }
    return {
      ok: true,
      healthy: issues.length === 0,
      vaultPath,
      indexPath: this.indexPath,
      schemaVersion: status.schemaVersion,
      noteCount: status.noteCount,
      unresolvedCount: unresolved.length,
      unresolved,
      issues,
    };
  }

  close(): void {
    // Connections are intentionally scoped and closed by each operation.
  }

  private unhealthyDoctorResult(
    vaultPath: string,
    issue: string,
  ): WikiDoctorResult {
    return {
      ok: true,
      healthy: false,
      vaultPath,
      indexPath: this.indexPath,
      schemaVersion: null,
      noteCount: 0,
      unresolvedCount: 0,
      unresolved: [],
      issues: [issue],
    };
  }

  private resolvePath(database: Database.Database, identity: string): string {
    const notes = database
      .prepare('SELECT path, title FROM notes ORDER BY path')
      .all() as Array<{ path: string; title: string }>;
    const resolution = resolveNoteIdentity(notes, identity);
    if (resolution.path) return resolution.path;
    if (resolution.candidates.length > 0) {
      throw new WikiError(
        'NOTE_AMBIGUOUS',
        `Note identity is ambiguous: ${identity}`,
        resolution.candidates,
      );
    }
    throw new WikiError('NOTE_NOT_FOUND', `Note not found: ${identity}`);
  }

  private withReadableDatabase<T>(
    operation: (database: Database.Database) => T,
  ): T {
    if (!existsSync(this.indexPath)) {
      throw new WikiError(
        'INDEX_NOT_FOUND',
        `Wiki index does not exist: ${this.indexPath}; run wiki reindex`,
      );
    }
    const database = new Database(this.indexPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5000,
    });
    try {
      database.pragma('foreign_keys = ON');
      database.pragma('busy_timeout = 5000');
      return operation(database);
    } catch (error) {
      if (error instanceof WikiError) throw error;
      throw new WikiError('INDEX_ERROR', 'Failed to read Wiki index', [], {
        cause: error,
      });
    } finally {
      database.close();
    }
  }
}
