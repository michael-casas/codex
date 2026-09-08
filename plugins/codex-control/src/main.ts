import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
  ControlGatewayError,
  createCodexControlServer,
  createControlHttpClient,
  type CodexControlPlane,
} from '@codex/control-gateway';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const origin = process.env['CODEX_CONTROL_ORIGIN'] ?? 'http://127.0.0.1:4765';
const actorAgentId =
  process.env['CODEX_CONTROL_ACTOR_AGENT_ID'] ?? 'codex-control-user';
const scopes = [
  'control:delegate',
  'control:message',
  'control:workflow',
  'control:cancel',
  'control:read',
];
let pendingClient:
  | Promise<ReturnType<typeof createControlHttpClient>>
  | undefined;

async function loadClient() {
  const tokenFile = process.env['CODEX_CONTROL_TOKEN_FILE'];
  if (!tokenFile || !isAbsolute(tokenFile))
    throw new ControlGatewayError(
      'CONTROL_NOT_CONFIGURED',
      'CODEX_CONTROL_TOKEN_FILE is required and must be absolute.',
    );
  const metadata = await stat(tokenFile).catch(() => undefined);
  if (!metadata?.isFile() || (metadata.mode & 0o077) !== 0)
    throw new ControlGatewayError(
      'CONTROL_AUTHENTICATION_FAILED',
      'CODEX_CONTROL_TOKEN_FILE must be an owner-only file.',
    );
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (Buffer.byteLength(token, 'utf8') < 32)
    throw new ControlGatewayError(
      'CONTROL_AUTHENTICATION_FAILED',
      'CODEX_CONTROL_TOKEN_FILE is invalid.',
    );
  return createControlHttpClient({ origin, token, actorAgentId, scopes });
}

function client() {
  pendingClient ??= loadClient().catch((error: unknown) => {
    pendingClient = undefined;
    throw error;
  });
  return pendingClient;
}

const control: CodexControlPlane = {
  delegateAgent: async (...args) => (await client()).delegateAgent(...args),
  sendAgentMessage: async (...args) =>
    (await client()).sendAgentMessage(...args),
  runWorkflow: async (...args) => (await client()).runWorkflow(...args),
  cancelAgent: async (...args) => (await client()).cancelAgent(...args),
  cancelWorkflow: async (...args) => (await client()).cancelWorkflow(...args),
  snapshot: async (...args) => (await client()).snapshot(...args),
  wait: async (...args) => (await client()).wait(...args),
};

await createCodexControlServer({
  control,
  authorize: () => ({ actorAgentId, scopes }),
  browserBaseUrl: origin,
}).connect(new StdioServerTransport());
