import { createHash } from 'node:crypto';
import * as path from 'node:path';

import type {
  FrontmatterValue,
  ParsedWikiNote,
  WikiHeading,
  WikiLink,
} from '../../domain/entities/wiki-note.js';

export interface ParseMarkdownNoteInput {
  relativePath: string;
  markdown: string;
  mtimeMs: number;
  size: number;
}

interface FrontmatterParseResult {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((entry) => unquote(entry));
  }
  return unquote(trimmed);
}

function parseFrontmatter(markdown: string): FrontmatterParseResult {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return { frontmatter: {}, body: markdown };
  }
  const closing = markdown.match(/\r?\n---\r?\n/);
  if (!closing || closing.index === undefined) {
    return { frontmatter: {}, body: markdown };
  }

  const block = markdown.slice(markdown.indexOf('\n') + 1, closing.index);
  const frontmatter: Record<string, FrontmatterValue> = {};
  let activeListKey: string | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    const listMatch = rawLine.match(/^\s+-\s+(.+)$/);
    if (listMatch && activeListKey) {
      const current = frontmatter[activeListKey];
      if (Array.isArray(current)) current.push(unquote(listMatch[1] as string));
      continue;
    }

    const property = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!property) {
      activeListKey = null;
      continue;
    }
    const key = property[1] as string;
    const rawValue = property[2] ?? '';
    if (rawValue.trim() === '') {
      frontmatter[key] = [];
      activeListKey = key;
    } else {
      frontmatter[key] = parseScalar(rawValue);
      activeListKey = null;
    }
  }

  return {
    frontmatter,
    body: markdown.slice(closing.index + closing[0].length),
  };
}

function headingAnchor(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function parseHeadings(body: string): WikiHeading[] {
  const headings: WikiHeading[] = [];
  for (const match of body.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)) {
    const text = (match[2] as string).trim();
    headings.push({
      level: (match[1] as string).length,
      text,
      anchor: headingAnchor(text),
    });
  }
  return headings;
}

function parseLinks(body: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const [targetAndFragment, label] = (match[1] as string).split('|', 2);
    const fragmentAt = (targetAndFragment as string).indexOf('#');
    const target = (
      fragmentAt === -1
        ? targetAndFragment
        : (targetAndFragment as string).slice(0, fragmentAt)
    ).trim();
    const fragment =
      fragmentAt === -1
        ? null
        : (targetAndFragment as string).slice(fragmentAt + 1).trim() || null;
    if (target) {
      links.push({ target, fragment, label: label?.trim() || null });
    }
  }
  return links;
}

function stringArray(value: FrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  return [];
}

export function parseMarkdownNote(
  input: ParseMarkdownNoteInput,
): ParsedWikiNote {
  const normalizedPath = input.relativePath.replaceAll('\\', '/');
  const { frontmatter, body } = parseFrontmatter(input.markdown);
  const headings = parseHeadings(body);
  const explicitTitle = frontmatter['title'];
  const title =
    (typeof explicitTitle === 'string' && explicitTitle.trim()) ||
    headings.find((heading) => heading.level === 1)?.text ||
    path.posix.basename(normalizedPath, '.md');

  return {
    path: normalizedPath,
    title,
    frontmatter,
    tags: stringArray(frontmatter['tags']),
    body,
    markdown: input.markdown,
    headings,
    links: parseLinks(body),
    hash: createHash('sha256').update(input.markdown).digest('hex'),
    mtimeMs: input.mtimeMs,
    size: input.size,
  };
}
