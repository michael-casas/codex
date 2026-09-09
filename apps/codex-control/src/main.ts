import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { createControlHttpClient } from '@codex/control-gateway';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCodexControlServer } from './control/codex-control.gateway.js';

const origin = process.env.CODEX_CONTROL_ORIGIN ?? 'http://127.0.0.1:4765';
const tokenFile = process.env.CODEX_CONTROL_TOKEN_FILE;
if (!tokenFile || !isAbsolute(tokenFile))
  throw new Error('CODEX_CONTROL_TOKEN_FILE is required and must be absolute.');
const metadata = await stat(tokenFile);
if (!metadata.isFile() || (metadata.mode & 0o077) !== 0)
  throw new Error('CODEX_CONTROL_TOKEN_FILE must be an owner-only file.');
const token = (await readFile(tokenFile, 'utf8')).trim();
const actorAgentId =
  process.env.CODEX_CONTROL_ACTOR_AGENT_ID ?? 'codex-control-user';
const scopes = [
  'control:project',
  'control:delegate',
  'control:message',
  'control:workflow',
  'control:cancel',
  'control:read',
];
const control = createControlHttpClient({
  origin,
  token,
  actorAgentId,
  scopes,
});

await createCodexControlServer({
  control,
  authorize: () => ({ actorAgentId, scopes }),
  browserBaseUrl: origin,
}).connect(new StdioServerTransport());
