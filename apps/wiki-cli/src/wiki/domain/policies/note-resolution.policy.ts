import * as path from 'node:path';

export interface NoteIdentityCandidate {
  path: string;
  title: string;
}

export interface NoteResolution {
  path: string | null;
  candidates: string[];
}

function normalizeIdentity(identity: string): string {
  return identity.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function withoutMarkdownExtension(value: string): string {
  return value.toLowerCase().endsWith('.md') ? value.slice(0, -3) : value;
}

function uniqueResolution(matches: NoteIdentityCandidate[]): NoteResolution {
  const candidates = [...new Set(matches.map((note) => note.path))].sort();
  return candidates.length === 1
    ? { path: candidates[0] as string, candidates: [] }
    : { path: null, candidates };
}

export function resolveNoteIdentity(
  notes: NoteIdentityCandidate[],
  identity: string,
): NoteResolution {
  const normalized = normalizeIdentity(identity);
  const normalizedWithoutExtension = withoutMarkdownExtension(normalized);

  const exactPath = notes.filter(
    (note) => note.path.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );
  if (exactPath.length > 0) return uniqueResolution(exactPath);

  const extensionlessPath = notes.filter(
    (note) =>
      withoutMarkdownExtension(note.path).toLocaleLowerCase() ===
      normalizedWithoutExtension.toLocaleLowerCase(),
  );
  if (extensionlessPath.length > 0) return uniqueResolution(extensionlessPath);

  const stem = path.posix.basename(normalizedWithoutExtension);
  const stemMatches = notes.filter(
    (note) =>
      withoutMarkdownExtension(
        path.posix.basename(note.path),
      ).toLocaleLowerCase() === stem.toLocaleLowerCase(),
  );
  if (stemMatches.length > 0) return uniqueResolution(stemMatches);

  const titleMatches = notes.filter(
    (note) => note.title.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );
  return uniqueResolution(titleMatches);
}
