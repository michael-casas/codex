import { openAgentWiki, WikiError, type AgentWiki } from '../wiki/index.js';

import {
  parseWikiArguments,
  WIKI_HELP,
  type WikiCommand,
} from './wiki-cli.arguments.js';
import { renderFailure, renderSuccess } from './wiki-cli.renderer.js';

export interface WikiCliDependencies {
  env?: NodeJS.ProcessEnv;
  stdout?(text: string): void;
  stderr?(text: string): void;
  openWiki?(options: { vaultPath: string; indexPath: string }): AgentWiki;
}

async function executeCommand(
  command: WikiCommand,
  wiki: AgentWiki,
): Promise<object> {
  switch (command.name) {
    case 'status':
      return wiki.status();
    case 'reindex':
      return wiki.reindex({ full: command.full });
    case 'get':
      return wiki.get(command.note);
    case 'search':
      return wiki.search({
        query: command.query,
        scope: command.scope,
        limit: command.limit,
      });
    case 'links':
      return wiki.links(command.note);
    case 'backlinks':
      return wiki.backlinks(command.note);
    case 'unresolved':
      return wiki.unresolved();
    case 'orphans':
      return wiki.orphans();
    case 'context':
      return wiki.context({ seed: command.seed, maxTokens: command.maxTokens });
    case 'doctor':
      return wiki.doctor();
  }
}

export async function runWikiCli(
  args: string[],
  dependencies: WikiCliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? ((text) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text) => process.stderr.write(text));
  let parsed;
  try {
    parsed = parseWikiArguments(args, env);
  } catch (error) {
    stderr(renderFailure(error, args.includes('--json')));
    return 2;
  }

  if (parsed.help || !parsed.command) {
    stdout(WIKI_HELP);
    return 0;
  }

  const openWiki = dependencies.openWiki ?? openAgentWiki;
  const wiki = openWiki({
    vaultPath: parsed.vaultPath,
    indexPath: parsed.indexPath,
  });
  try {
    const result = await executeCommand(parsed.command, wiki);
    stdout(renderSuccess(parsed.command, result, parsed.json));
    return 0;
  } catch (error) {
    stderr(renderFailure(error, parsed.json));
    return error instanceof WikiError && error.code === 'USAGE_ERROR' ? 2 : 1;
  } finally {
    wiki.close();
  }
}
