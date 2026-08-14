import { resolveWikiPaths } from '../config/wiki-paths.js';
import { WikiError, type WikiScope } from '../wiki/index.js';

export const WIKI_HELP = `wiki — headless Agent Wiki retrieval

Usage:
  wiki status [--json]
  wiki reindex [--full] [--json]
  wiki get <title-or-path> [--json]
  wiki search <query> [--scope standards|skills|all] [-k N] [--json]
  wiki links <note> [--json]
  wiki backlinks <note> [--json]
  wiki unresolved [--json]
  wiki orphans [--json]
  wiki context --seed <note-or-query> [--max-tokens N] [--json]
  wiki doctor [--json]

Global options:
  --vault PATH   Vault override (then AGENT_WIKI_HOME, then WIKI_VAULT)
  --json         Emit one JSON value
  --help         Show this help

Environment:
  AGENT_WIKI_HOME  Canonical cloned Agent Wiki vault root
  WIKI_VAULT       Legacy vault override
  WIKI_INDEX_PATH  Index override (default CODEX_HOME/.runtime/wiki/agent-wiki.sqlite)

Search trust order: standards, then skills, then the rest of the vault.
Context token counts are conservative word/punctuation estimates, not model-specific tokenization.
`;

export type WikiCommand =
  | { name: 'status' }
  | { name: 'reindex'; full: boolean }
  | { name: 'get' | 'links' | 'backlinks'; note: string }
  | { name: 'search'; query: string; scope: WikiScope; limit: number }
  | { name: 'unresolved' | 'orphans' | 'doctor' }
  | { name: 'context'; seed: string; maxTokens: number };

export interface ParsedArguments {
  command: WikiCommand | null;
  help: boolean;
  json: boolean;
  vaultPath: string;
  indexPath: string;
}

function usage(message: string): never {
  throw new WikiError('USAGE_ERROR', message);
}

function positiveInteger(raw: string | undefined, label: string): number {
  if (!raw || !/^\d+$/.test(raw)) usage(`${label} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    usage(`${label} must be a positive integer`);
  }
  return value;
}

function requireText(parts: string[], label: string): string {
  const value = parts.join(' ').trim();
  if (!value) usage(`${label} is required`);
  return value;
}

function extractGlobalOptions(
  args: string[],
): { remaining: string[]; help: boolean; json: boolean; vaultPath?: string } {
  const remaining: string[] = [];
  let help = false;
  let json = false;
  let vaultPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--json') {
      json = true;
    } else if (argument === '--vault') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) usage('--vault requires a path');
      vaultPath = value;
      index += 1;
    } else {
      remaining.push(argument);
    }
  }
  return { remaining, help, json, vaultPath };
}

function parseSearch(args: string[]): WikiCommand {
  const queryParts: string[] = [];
  let scope: WikiScope = 'all';
  let limit = 10;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (argument === '--scope') {
      const value = args[index + 1];
      if (value !== 'standards' && value !== 'skills' && value !== 'all') {
        usage('Scope must be one of standards, skills, or all');
      }
      scope = value;
      index += 1;
    } else if (argument === '-k' || argument === '--limit') {
      limit = positiveInteger(args[index + 1], 'Limit');
      index += 1;
    } else if (argument.startsWith('-')) {
      usage(`Unknown search option: ${argument}`);
    } else {
      queryParts.push(argument);
    }
  }
  return {
    name: 'search',
    query: requireText(queryParts, 'Search query'),
    scope,
    limit,
  };
}

function parseContext(args: string[]): WikiCommand {
  let seed: string | null = null;
  let maxTokens = 2_000;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (argument === '--seed') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) usage('--seed requires a value');
      seed = value;
      index += 1;
    } else if (argument === '--max-tokens') {
      maxTokens = positiveInteger(args[index + 1], 'Token budget');
      index += 1;
    } else {
      usage(`Unknown context option: ${argument}`);
    }
  }
  if (!seed) usage('--seed is required');
  return { name: 'context', seed, maxTokens };
}

function parseCommand(args: string[]): WikiCommand {
  const [name, ...rest] = args;
  switch (name) {
    case 'status':
    case 'unresolved':
    case 'orphans':
    case 'doctor':
      if (rest.length > 0) usage(`${name} does not accept arguments`);
      return { name };
    case 'reindex':
      if (rest.some((argument) => argument !== '--full')) {
        usage('reindex accepts only --full');
      }
      return { name, full: rest.includes('--full') };
    case 'get':
    case 'links':
    case 'backlinks':
      if (rest.some((argument) => argument.startsWith('-'))) {
        usage(`Unknown ${name} option`);
      }
      return { name, note: requireText(rest, 'Note identity') };
    case 'search':
      return parseSearch(rest);
    case 'context':
      return parseContext(rest);
    case undefined:
      return usage('A command is required; run wiki --help');
    default:
      return usage(`Unknown command: ${name}`);
  }
}

export function parseWikiArguments(
  args: string[],
  env: NodeJS.ProcessEnv,
): ParsedArguments {
  const global = extractGlobalOptions(args);
  const paths = resolveWikiPaths(global.vaultPath, env);
  return {
    ...global,
    ...paths,
    command: global.help ? null : parseCommand(global.remaining),
  };
}
