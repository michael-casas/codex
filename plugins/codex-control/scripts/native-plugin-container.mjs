import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { chmodSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mode = process.env.CAS_NATIVE_PLUGIN_MODE ?? 'smoke';
const live = mode === 'live' || mode === 'paid-agent';
const paid = mode === 'paid-agent';
const rpcTimeoutMs = Number(
  process.env.CAS_NATIVE_PLUGIN_RPC_TIMEOUT_MS ?? 15000,
);
const turnTimeoutMs = Number(
  process.env.CAS_NATIVE_PLUGIN_TURN_TIMEOUT_MS ?? 120000,
);
const expectedTools = [
  'admit_project',
  'ask_agent',
  'cancel_agent',
  'cancel_workflow',
  'delegate_agent',
  'get_control_snapshot',
  'reply_agent',
  'run_workflow',
  'send_agent_message',
  'wait_control_delta',
];

mkdirSync(process.env.CODEX_HOME, { recursive: true });
chmodSync(process.env.CODEX_HOME, 0o700);

function cli(...arguments_) {
  return execFileSync('codex', arguments_, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
}

function assertNativeCli() {
  const pluginHelp = cli('plugin', '--help');
  const marketplaceHelp = cli('plugin', 'marketplace', '--help');
  const addHelp = cli('plugin', 'add', '--help');
  assert.match(pluginHelp, /marketplace/);
  assert.match(pluginHelp, /add/);
  assert.match(pluginHelp, /remove/);
  assert.match(marketplaceHelp, /add/);
  assert.match(addHelp, /plugin/i);
}

function assertInstalledPackage(installedPath) {
  const home = realpathSync(process.env.CODEX_HOME);
  const installed = realpathSync(installedPath);
  assert(
    installed.startsWith(`${home}/`),
    'Plugin was not installed in clean home',
  );
  assert.deepEqual(readdirSync(installed).sort(), [
    '.codex-plugin',
    '.mcp.json',
    'dist',
    'skills',
  ]);
}

async function closeChild(child, lines) {
  lines.close();
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const killed = setTimeout(() => child.kill('SIGKILL'), 2000);
  await new Promise((resolve) => child.once('close', resolve));
  clearTimeout(killed);
}

async function discover(installedPath, invokeAgent) {
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const pending = new Map();
  const observed = [];
  let nextId = 0;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (
      message.method === 'turn/completed' ||
      (message.method === 'item/completed' &&
        message.params?.item?.type === 'mcpToolCall')
    )
      observed.push(message);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error('APP_SERVER_RPC_ERROR'));
    else entry.resolve(message.result);
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`APP_SERVER_RPC_TIMEOUT:${method}`));
      }, rpcTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  try {
    await request('initialize', {
      clientInfo: { name: 'cas-native-plugin-gate', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    const skills = await request('skills/list', {
      cwds: ['/workspace'],
      forceReload: true,
    });
    assert(
      JSON.stringify(skills).includes(installedPath),
      'Installed plugin skill not discovered',
    );
    const statuses = await request('mcpServerStatus/list', {});
    const server = statuses.data.find((item) =>
      item.name.includes('codex-control'),
    );
    assert(server, 'Installed MCP server not discovered');
    assert.deepEqual(Object.keys(server.tools).sort(), expectedTools);

    if (live) {
      const thread = await request('thread/start', {
        cwd: '/workspace',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
      });
      const result = await request('mcpServer/tool/call', {
        threadId: thread.thread.id,
        server: server.name,
        tool: 'get_control_snapshot',
        arguments: {},
      });
      assert(!result.isError, 'Installed snapshot invocation failed');
      const body =
        result.structuredContent ??
        JSON.parse(result.content.find((item) => item.type === 'text').text);
      assert.equal(typeof body.cursor, 'string');
    }

    if (paid && invokeAgent) {
      const agentThread = await request('thread/start', {
        cwd: '/workspace',
        model: 'gpt-5.6-terra',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: false,
      });
      const turn = await request('turn/start', {
        threadId: agentThread.thread.id,
        model: 'gpt-5.6-terra',
        effort: 'low',
        input: [
          {
            type: 'text',
            text: 'Use the installed codex-control:codex-control skill. Call the installed get_control_snapshot MCP tool exactly once. This is strictly read-only: do not call any other tool, launch or cancel anything, edit files, or read credentials. Report PLUGIN_AGENT_CHECK_PASSED only after a valid snapshot, then stop.',
          },
        ],
      });
      const deadline = Date.now() + turnTimeoutMs;
      let terminal;
      while (Date.now() < deadline) {
        terminal = observed.find(
          (item) =>
            item.method === 'turn/completed' &&
            item.params?.turn?.id === turn.turn.id,
        )?.params.turn;
        if (terminal && terminal.status !== 'inProgress') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (terminal?.status !== 'completed') {
        await request('turn/interrupt', {
          threadId: agentThread.thread.id,
          turnId: turn.turn.id,
        }).catch(() => undefined);
        throw new Error('PAID_PLUGIN_TURN_FAILED_NO_RETRY');
      }
      const calls = observed
        .filter(
          (item) =>
            item.method === 'item/completed' &&
            item.params?.threadId === agentThread.thread.id,
        )
        .map((item) => item.params.item);
      assert(
        calls.length === 1 &&
          calls[0]?.server === 'codex-control' &&
          calls[0]?.tool === 'get_control_snapshot' &&
          calls[0]?.status === 'completed',
        'READ_ONLY_TOOL_ALLOWLIST_VIOLATION',
      );
    }
    return { server: server.name, tools: Object.keys(server.tools).length };
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    child.stdin.end();
    await closeChild(child, lines);
  }
}

let proxy;
try {
  assertNativeCli();
  if (live) {
    const backendPort = Number(
      process.env.CAS_NATIVE_PLUGIN_BACKEND_PORT ?? 4765,
    );
    proxy = createServer((request, response) => {
      if (
        request.method !== 'POST' ||
        request.url !== '/api/control/snapshot'
      ) {
        response.writeHead(403).end();
        return;
      }
      const upstream = httpRequest(
        {
          hostname: 'host.docker.internal',
          port: backendPort,
          path: '/api/control/snapshot',
          method: 'POST',
          headers: { ...request.headers, host: '127.0.0.1:4765' },
        },
        (upstreamResponse) => {
          response.writeHead(
            upstreamResponse.statusCode ?? 502,
            upstreamResponse.headers,
          );
          upstreamResponse.pipe(response);
        },
      );
      upstream.on('error', () => response.writeHead(502).end());
      request.pipe(upstream);
    });
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(4765, '127.0.0.1', resolve);
    });
  }

  cli('plugin', 'marketplace', 'add', '/market', '--json');
  const install = JSON.parse(
    cli('plugin', 'add', 'codex-control@codex-control-local', '--json'),
  );
  assertInstalledPackage(install.installedPath);
  const first = await discover(install.installedPath, true);
  cli('plugin', 'remove', 'codex-control@codex-control-local');
  const reinstall = JSON.parse(
    cli('plugin', 'add', 'codex-control@codex-control-local', '--json'),
  );
  assertInstalledPackage(reinstall.installedPath);
  const second = await discover(reinstall.installedPath, false);
  console.log(
    JSON.stringify({
      nativeInstall: true,
      reinstall: true,
      persistedAfterRestart: true,
      installedSkill: true,
      installedMcpTools: second.tools,
      server: second.server,
      firstDiscoveryTools: first.tools,
      codexVersion: cli('--version').trim(),
      bunVersion: execFileSync('bun', ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim(),
      mode,
      status: 'passed',
    }),
  );
} finally {
  if (proxy)
    await new Promise((resolve) => proxy.close(() => resolve(undefined)));
}
