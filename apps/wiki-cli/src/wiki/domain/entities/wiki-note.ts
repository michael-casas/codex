export type WikiScope = 'standards' | 'skills' | 'all';
export type FrontmatterValue = string | number | boolean | null | string[];

export interface WikiHeading {
  level: number;
  text: string;
  anchor: string;
}

export interface WikiLink {
  target: string;
  fragment: string | null;
  label: string | null;
}

export interface ParsedWikiNote {
  path: string;
  title: string;
  frontmatter: Record<string, FrontmatterValue>;
  tags: string[];
  body: string;
  markdown: string;
  headings: WikiHeading[];
  links: WikiLink[];
  hash: string;
  mtimeMs: number;
  size: number;
}

export interface WikiNoteSummary {
  path: string;
  title: string;
  type: string | null;
  status: string | null;
  tags: string[];
}

export interface WikiNote extends WikiNoteSummary {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
  markdown: string;
  headings: WikiHeading[];
}

export interface WikiSearchResult extends WikiNoteSummary {
  score: number;
  snippet: string;
}

export interface WikiGraphLink {
  sourcePath: string;
  target: string;
  targetPath: string | null;
  fragment: string | null;
  label: string | null;
  resolved: boolean;
  ambiguous: boolean;
}

export interface WikiStatusResult {
  ok: true;
  vaultPath: string;
  vaultExists: boolean;
  indexPath: string;
  indexExists: boolean;
  indexedVaultPath: string | null;
  noteCount: number;
  lastIndexedAt: string | null;
  fresh: boolean;
}

export interface WikiReindexResult {
  ok: true;
  vaultPath: string;
  indexPath: string;
  full: boolean;
  discovered: number;
  indexed: number;
  unchanged: number;
  removed: number;
  unresolved: number;
  indexedAt: string;
}

export interface WikiGetResult {
  ok: true;
  note: WikiNote;
}

export interface WikiSearchResults {
  ok: true;
  query: string;
  scope: WikiScope;
  limit: number;
  results: WikiSearchResult[];
}

export interface WikiLinksResult {
  ok: true;
  note: WikiNoteSummary;
  links: WikiGraphLink[];
}

export interface WikiBacklinksResult {
  ok: true;
  note: WikiNoteSummary;
  backlinks: WikiGraphLink[];
}

export interface WikiUnresolvedResult {
  ok: true;
  unresolved: WikiGraphLink[];
}

export interface WikiOrphansResult {
  ok: true;
  orphans: WikiNoteSummary[];
}

export interface WikiContextSource {
  path: string;
  title: string;
  content: string;
  estimatedTokens: number;
}

export interface WikiContextResult {
  ok: true;
  seed: WikiNoteSummary;
  maxTokens: number;
  estimatedTokens: number;
  context: string;
  sources: WikiContextSource[];
}

export interface WikiDoctorResult {
  ok: true;
  healthy: boolean;
  vaultPath: string;
  indexPath: string;
  schemaVersion: number | null;
  noteCount: number;
  unresolvedCount: number;
  unresolved: WikiGraphLink[];
  issues: string[];
}
