import { mkdirSync } from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

import { WikiError } from '../../../domain/errors/wiki.errors.js';

export const WIKI_INDEX_SCHEMA_VERSION = 1;

export function metadataValue(
  database: Database.Database,
  key: string,
): string | null {
  const row = database
    .prepare('SELECT value FROM metadata WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMetadata(
  database: Database.Database,
  key: string,
  value: string,
): void {
  database
    .prepare(
      'INSERT INTO metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function createWikiIndexSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT,
      status TEXT,
      tags_json TEXT NOT NULL,
      frontmatter_json TEXT NOT NULL,
      body TEXT NOT NULL,
      markdown TEXT NOT NULL,
      hash TEXT NOT NULL,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      indexed_at TEXT NOT NULL,
      trust_tier INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS headings (
      id INTEGER PRIMARY KEY,
      note_path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
      level INTEGER NOT NULL,
      text TEXT NOT NULL,
      anchor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY,
      source_path TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
      target_text TEXT NOT NULL,
      target_fragment TEXT,
      label TEXT,
      target_path TEXT REFERENCES notes(path) ON DELETE SET NULL,
      ambiguous INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS headings_note_path_idx ON headings(note_path);
    CREATE INDEX IF NOT EXISTS links_source_path_idx ON links(source_path);
    CREATE INDEX IF NOT EXISTS links_target_path_idx ON links(target_path);
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      path UNINDEXED,
      title,
      body,
      tags,
      tokenize = 'porter unicode61'
    );
  `);
  if (metadataValue(database, 'schema_version') === null) {
    setMetadata(database, 'schema_version', String(WIKI_INDEX_SCHEMA_VERSION));
  }
}

export function assertWikiIndexSchema(database: Database.Database): number {
  const rawVersion = metadataValue(database, 'schema_version');
  const version = rawVersion === null ? null : Number(rawVersion);
  if (version !== WIKI_INDEX_SCHEMA_VERSION) {
    throw new WikiError(
      'INDEX_SCHEMA_UNSUPPORTED',
      `Wiki index schema ${rawVersion ?? 'unknown'} is unsupported; run reindex --full`,
    );
  }
  return version;
}

export function openWritableWikiIndex(indexPath: string): Database.Database {
  mkdirSync(path.dirname(indexPath), { recursive: true, mode: 0o700 });
  const database = new Database(indexPath);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('wal_autocheckpoint = 1000');
  return database;
}
