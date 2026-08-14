import { WikiError } from '../wiki/index.js';

import type { WikiCommand } from './wiki-cli.arguments.js';

export function errorEnvelope(error: unknown): Record<string, unknown> {
  if (error instanceof WikiError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        candidates: error.candidates,
      },
    };
  }
  return {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'wiki command failed' },
  };
}

function lines(
  value: unknown,
  render: (entry: Record<string, unknown>) => string,
): string {
  return (value as Array<Record<string, unknown>>).map(render).join('\n');
}

function humanOutput(
  command: WikiCommand,
  result: Record<string, unknown>,
): string {
  switch (command.name) {
    case 'status':
      return [
        `Vault: ${String(result['vaultPath'])} (${result['vaultExists'] ? 'available' : 'missing'})`,
        `Index: ${String(result['indexPath'])} (${result['indexExists'] ? 'available' : 'missing'})`,
        `Notes: ${String(result['noteCount'])}`,
        `Fresh: ${result['fresh'] ? 'yes' : 'no'}`,
      ].join('\n');
    case 'reindex':
      return `Indexed ${String(result['indexed'])}/${String(result['discovered'])} notes; removed ${String(result['removed'])}; unresolved ${String(result['unresolved'])}`;
    case 'get':
      return String((result['note'] as Record<string, unknown>)['markdown']);
    case 'search':
      return lines(
        result['results'],
        (entry) => `${String(entry['path'])} — ${String(entry['title'])}`,
      );
    case 'links':
      return lines(
        result['links'],
        (entry) =>
          `${String(entry['target'])} -> ${String(entry['targetPath'] ?? 'unresolved')}`,
      );
    case 'backlinks':
      return lines(result['backlinks'], (entry) => String(entry['sourcePath']));
    case 'unresolved':
      return lines(
        result['unresolved'],
        (entry) =>
          `${String(entry['sourcePath'])} -> ${String(entry['target'])}`,
      );
    case 'orphans':
      return lines(result['orphans'], (entry) => String(entry['path']));
    case 'context':
      return String(result['context']);
    case 'doctor':
      return `${result['healthy'] ? 'healthy' : 'unhealthy'}: ${String(result['noteCount'])} notes, ${String(result['unresolvedCount'])} unresolved links`;
  }
}

export function renderSuccess(
  command: WikiCommand,
  result: object,
  json: boolean,
): string {
  return json
    ? `${JSON.stringify(result)}\n`
    : `${humanOutput(command, result as Record<string, unknown>)}\n`;
}

export function renderFailure(error: unknown, json: boolean): string {
  const output = errorEnvelope(error);
  return json
    ? `${JSON.stringify(output)}\n`
    : `${String((output['error'] as Record<string, unknown>)['message'])}\n`;
}
