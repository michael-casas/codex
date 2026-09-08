import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const featurePath = fileURLToPath(
  new URL('../../features/cas-11-r2/codex-plugin.feature', import.meta.url),
);
type Pickle = { name: string; steps: readonly { text: string }[] };
const { getPicklesAndErrors } =
  require('@cucumber/cucumber/lib/api/gherkin') as {
    getPicklesAndErrors(options: {
      newId: () => string;
      cwd: string;
      sourcePaths: string[];
      coordinates: {
        defaultDialect: string;
        paths: string[];
        names: string[];
        tagExpression: string;
        order: 'defined';
      };
    }): Promise<{
      filterablePickles: readonly { pickle: Pickle }[];
      parseErrors: readonly unknown[];
    }>;
  };
let sequence = 0;
const parsed = await getPicklesAndErrors({
  newId: () => String((sequence += 1)),
  cwd: workspaceRoot,
  sourcePaths: [featurePath],
  coordinates: {
    defaultDialect: 'en',
    paths: [featurePath],
    names: [],
    tagExpression: '@BATDD-CAS-11-R2-001',
    order: 'defined',
  },
});
if (parsed.parseErrors.length || parsed.filterablePickles.length !== 1)
  throw new Error('CAS11R2_GHERKIN_INVALID');

async function findPluginRoot(root: string): Promise<string> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    if (
      await stat(join(path, '.codex-plugin/plugin.json'))
        .then(() => true)
        .catch(() => false)
    )
      return path;
    const found = await findPluginRoot(path).catch(() => undefined);
    if (found) return found;
  }
  throw new Error('CAS11R2_INSTALLED_PLUGIN_MISSING');
}

interface State {
  root?: string;
  pluginRoot?: string;
  client?: Client;
  transport?: StdioClientTransport;
  server?: Server;
  result?: unknown;
}

async function cleanup(state: State): Promise<void> {
  await state.client?.close();
  await state.transport?.close();
  await new Promise<void>(
    (resolveClose, reject) =>
      state.server?.close((error) =>
        error ? reject(error) : resolveClose(),
      ) ?? resolveClose(),
  );
  if (state.root) await rm(state.root, { recursive: true, force: true });
}

const bindings: Record<string, (state: State) => Promise<void>> = {
  'the repository marketplace contains the canonical Codex Control plugin':
    async () => {
      const marketplace = JSON.parse(
        await readFile(
          join(workspaceRoot, '.agents/plugins/marketplace.json'),
          'utf8',
        ),
      ) as { plugins?: { name?: string }[] };
      expect(marketplace.plugins?.map(({ name }) => name)).toContain(
        'codex-control',
      );
    },
  'a fresh isolated Codex home installs Codex Control': async (state) => {
    state.root = await mkdtemp(join(tmpdir(), 'cas-11-r2-codex-'));
    const codexHome = join(state.root, 'codex-home');
    await mkdir(codexHome);
    const env = { ...process.env, CODEX_HOME: codexHome };
    await execute(
      'codex',
      ['plugin', 'marketplace', 'add', workspaceRoot, '--json'],
      { cwd: workspaceRoot, env },
    );
    await execute(
      'codex',
      ['plugin', 'add', 'codex-control@codex-control-local', '--json'],
      { cwd: workspaceRoot, env },
    );
    state.pluginRoot = await findPluginRoot(codexHome);
  },
  'the installed plugin exposes the Codex Control skill and MCP server': async (
    state,
  ) => {
    if (!state.pluginRoot) throw new Error('CAS11R2_PLUGIN_ROOT_MISSING');
    const manifest = JSON.parse(
      await readFile(
        join(state.pluginRoot, '.codex-plugin/plugin.json'),
        'utf8',
      ),
    ) as { skills?: string; mcpServers?: string };
    expect(manifest).toMatchObject({
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
    expect(
      await readFile(
        join(state.pluginRoot, 'skills/codex-control/SKILL.md'),
        'utf8',
      ),
    ).toContain('browser:control-in-app-browser');
  },
  'one delegated agent result contains the loopback Browser URL': async (
    state,
  ) => {
    if (!state.root || !state.pluginRoot)
      throw new Error('CAS11R2_PLUGIN_NOT_INSTALLED');
    const token = 'd'.repeat(64);
    const tokenFile = join(state.root, 'token');
    await writeFile(tokenFile, token, { mode: 0o600 });
    state.server = createServer((request, response) => {
      if (
        request.url !== '/api/control/delegateAgent' ||
        request.headers.authorization !== `Bearer ${token}`
      ) {
        response.writeHead(401).end();
        return;
      }
      request.resume();
      request.on('end', () =>
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            delegationId: 'delegation-installed',
            executionId: 'execution-installed',
            agentId: 'agent-installed',
            hostId: 'local',
            threadId: 'thread-installed',
          }),
        ),
      );
    });
    await new Promise<void>((resolveListen, reject) => {
      state.server?.once('error', reject);
      state.server?.listen(0, '127.0.0.1', resolveListen);
    });
    const address = state.server.address();
    if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
    const origin = `http://127.0.0.1:${address.port}`;
    const config = JSON.parse(
      await readFile(join(state.pluginRoot, '.mcp.json'), 'utf8'),
    ) as {
      mcpServers?: Record<
        string,
        { command?: string; args?: string[]; cwd?: string }
      >;
    };
    const server = config.mcpServers?.['codex-control'];
    if (!server?.command) throw new Error('CAS11R2_MCP_SERVER_MISSING');
    state.transport = new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      cwd: resolve(state.pluginRoot, server.cwd ?? '.'),
      stderr: 'pipe',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        CODEX_CONTROL_ORIGIN: origin,
        CODEX_CONTROL_TOKEN_FILE: tokenFile,
        CODEX_CONTROL_ACTOR_AGENT_ID: 'fresh-codex',
      },
    });
    state.client = new Client({ name: 'cas-11-r2-l3', version: '1.0.0' });
    await state.client.connect(state.transport);
    state.result = await state.client.callTool({
      name: 'delegate_agent',
      arguments: {
        idempotencyKey: 'delegate-installed',
        assignmentRef: 'CAS-11.R2',
        assignmentDigest: `sha256:${'a'.repeat(64)}`,
        hostId: 'local',
        repositoryId: 'codex',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'CAS-11.R2',
        model: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
        completionBoundary: 'ready-for-audit',
        prompt: 'Inspect only.',
      },
    });
    const result = state.result as {
      isError?: boolean;
      structuredContent?: {
        agentId?: string;
        presentation?: { browserUrl?: string };
      };
    };
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent?.agentId, 'agent-installed');
    assert.equal(
      result.structuredContent?.presentation?.browserUrl,
      `${origin}/agents/agent-installed`,
    );
  },
  'no ChatGPT application or tunnel is required': async (state) => {
    expect(state.result).toBeDefined();
    expect(process.env['OPENAI_SECURE_MCP_TUNNEL']).toBeUndefined();
  },
};

// === L2: END-TO-END TESTS ===
for (const { pickle } of parsed.filterablePickles) {
  test(`[L2:E2E] @cas11r2-l3 ${pickle.name}`, async () => {
    test.setTimeout(45_000);
    const state: State = {};
    try {
      for (const step of pickle.steps) {
        const binding = bindings[step.text];
        expect(binding, `Missing binding for ${step.text}`).toBeDefined();
        await binding(state);
      }
    } finally {
      await cleanup(state);
    }
  });
}
