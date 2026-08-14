import Database from 'better-sqlite3';

import type {
  FrontmatterValue,
  ParsedWikiNote,
  WikiReindexResult,
} from '../../../domain/entities/wiki-note.js';
import { WikiError } from '../../../domain/errors/wiki.errors.js';
import { resolveNoteIdentity } from '../../../domain/policies/note-resolution.policy.js';
import { trustTier } from '../../../domain/policies/search-query.policy.js';
import {
  assertWikiIndexSchema,
  createWikiIndexSchema,
  metadataValue,
  setMetadata,
  WIKI_INDEX_SCHEMA_VERSION,
} from './sqlite-index.schema.js';

interface ExistingNote {
  path: string;
  hash: string;
  mtime_ms: number;
  size: number;
}

function stringProperty(
  frontmatter: Record<string, FrontmatterValue>,
  key: string,
): string | null {
  const value = frontmatter[key];
  return typeof value === 'string' ? value : null;
}

function changedNotes(
  notes: ParsedWikiNote[],
  existing: ExistingNote[],
  full: boolean,
): ParsedWikiNote[] {
  if (full) return notes;
  const existingByPath = new Map(existing.map((note) => [note.path, note]));
  return notes.filter((note) => {
    const previous = existingByPath.get(note.path);
    return (
      !previous ||
      previous.hash !== note.hash ||
      previous.mtime_ms !== note.mtimeMs ||
      previous.size !== note.size
    );
  });
}

function insertChangedNotes(
  database: Database.Database,
  notes: ParsedWikiNote[],
  indexedAt: string,
): void {
  const deleteFts = database.prepare('DELETE FROM notes_fts WHERE path = ?');
  const deleteNote = database.prepare('DELETE FROM notes WHERE path = ?');
  const insertNote = database.prepare(`
    INSERT INTO notes(
      path, title, type, status, tags_json, frontmatter_json, body,
      markdown, hash, mtime_ms, size, indexed_at, trust_tier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertHeading = database.prepare(
    'INSERT INTO headings(note_path, level, text, anchor) VALUES (?, ?, ?, ?)',
  );
  const insertLink = database.prepare(`
    INSERT INTO links(
      source_path, target_text, target_fragment, label, target_path, ambiguous
    ) VALUES (?, ?, ?, ?, NULL, 0)
  `);
  const insertFts = database.prepare(
    'INSERT INTO notes_fts(path, title, body, tags) VALUES (?, ?, ?, ?)',
  );

  for (const note of notes) {
    deleteFts.run(note.path);
    deleteNote.run(note.path);
    insertNote.run(
      note.path,
      note.title,
      stringProperty(note.frontmatter, 'type'),
      stringProperty(note.frontmatter, 'status'),
      JSON.stringify(note.tags),
      JSON.stringify(note.frontmatter),
      note.body,
      note.markdown,
      note.hash,
      note.mtimeMs,
      note.size,
      indexedAt,
      trustTier(note.path),
    );
    for (const heading of note.headings) {
      insertHeading.run(note.path, heading.level, heading.text, heading.anchor);
    }
    for (const link of note.links) {
      insertLink.run(note.path, link.target, link.fragment, link.label);
    }
    insertFts.run(note.path, note.title, note.body, note.tags.join(' '));
  }
}

function resolveStoredLinks(database: Database.Database): void {
  const identities = database
    .prepare('SELECT path, title FROM notes ORDER BY path')
    .all() as Array<{ path: string; title: string }>;
  const links = database
    .prepare('SELECT id, target_text FROM links ORDER BY id')
    .all() as Array<{ id: number; target_text: string }>;
  const updateLink = database.prepare(
    'UPDATE links SET target_path = ?, ambiguous = ? WHERE id = ?',
  );
  for (const link of links) {
    const resolution = resolveNoteIdentity(identities, link.target_text);
    updateLink.run(
      resolution.path,
      resolution.path === null && resolution.candidates.length > 0 ? 1 : 0,
      link.id,
    );
  }
}

export function writeWikiProjection(
  database: Database.Database,
  indexPath: string,
  options: { notes: ParsedWikiNote[]; vaultPath: string; full: boolean },
): WikiReindexResult {
  const indexedAt = new Date().toISOString();
  createWikiIndexSchema(database);
  assertWikiIndexSchema(database);
  const indexedVaultPath = metadataValue(database, 'vault_path');
  if (
    indexedVaultPath !== null &&
    indexedVaultPath !== options.vaultPath &&
    !options.full
  ) {
    throw new WikiError(
      'INDEX_VAULT_MISMATCH',
      `Index belongs to ${indexedVaultPath}; run reindex --full for ${options.vaultPath}`,
    );
  }

  const existing = database
    .prepare('SELECT path, hash, mtime_ms, size FROM notes ORDER BY path')
    .all() as ExistingNote[];
  const currentPaths = new Set(options.notes.map((note) => note.path));
  const removed = existing
    .filter((note) => !currentPaths.has(note.path))
    .map((note) => note.path);
  const changed = changedNotes(options.notes, existing, options.full);

  database.transaction(() => {
    if (options.full) {
      database.exec(
        'DELETE FROM links; DELETE FROM headings; DELETE FROM notes; DELETE FROM notes_fts;',
      );
    } else {
      const deleteFts = database.prepare(
        'DELETE FROM notes_fts WHERE path = ?',
      );
      const deleteNote = database.prepare('DELETE FROM notes WHERE path = ?');
      for (const notePath of removed) {
        deleteFts.run(notePath);
        deleteNote.run(notePath);
      }
    }
    insertChangedNotes(database, changed, indexedAt);
    resolveStoredLinks(database);
    setMetadata(database, 'schema_version', String(WIKI_INDEX_SCHEMA_VERSION));
    setMetadata(database, 'vault_path', options.vaultPath);
    setMetadata(database, 'last_indexed_at', indexedAt);
  })();

  const unresolved = (
    database
      .prepare('SELECT COUNT(*) AS count FROM links WHERE target_path IS NULL')
      .get() as { count: number }
  ).count;
  return {
    ok: true,
    vaultPath: options.vaultPath,
    indexPath,
    full: options.full,
    discovered: options.notes.length,
    indexed: changed.length,
    unchanged: options.notes.length - changed.length,
    removed: removed.length,
    unresolved,
    indexedAt,
  };
}
