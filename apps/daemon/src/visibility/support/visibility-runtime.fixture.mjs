import { execFile, spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import pg from 'pg';
import { createRuntimeVisibilityDatabaseFixture } from '@codex/db/testing';
import { createProductionControlRuntime } from '../../main.ts';

const execute = promisify(execFile);
const workspace = process.cwd();
const database = await createRuntimeVisibilityDatabaseFixture();
const root = await realpath(await mkdtemp(join(tmpdir(), 'cas-ui-native-')));
await writeFile(
  join(root, 'ownership.json'),
  JSON.stringify({
    assignmentId: 'CAS-UI-R1',
    pid: process.pid,
    databaseName: database.databaseName,
  }),
  { mode: 0o600 },
);
let runtime;
let host;
let control;
let shutdownStarted = false;
let hostExit;
async function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;
  const failures = [];
  const release = async (name, operation) => {
    try {
      await operation();
    } catch {
      failures.push(name);
    }
  };
  await release('runtime', () => runtime?.stop());
  await release('controls', () => control?.stop(true));
  await release('host', async () => {
    if (host && host.exitCode === null) {
      host.stdin.end(JSON.stringify({ stop: true }) + '\n');
      await hostExit;
    }
  });
  await release('database', () => database.close());
  await release('root', () => rm(root, { recursive: true, force: true }));
  if (failures.length)
    throw Error('SYNTHETIC_SHUTDOWN_FAILED:' + failures.join(','));
}
try {
  const owner = new pg.Client({ connectionString: database.ownerUrl });
  await owner.connect();
  try {
    for (const file of [
      '003_agent_messaging.sql',
      '004_agent_delegation.sql',
      '006_visibility_source_reads.sql',
      '007_visibility_items.sql',
    ]) {
      const sql = await readFile(
        resolve('migrations/process', file),
        'utf8',
      ).catch((error) => {
        if ((file.startsWith('006')||file.startsWith('007')) && error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (sql) await owner.query(sql);
    }
  } finally {
    await owner.end();
  }
  await mkdir(join(root, 'leases'));
  await writeFile(join(root, 'token'), 's'.repeat(64), { mode: 0o600 });
  await execute(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(root, 'key.pem'),
      '-out',
      join(root, 'cert.pem'),
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-days',
      '1',
    ],
    { timeout: 10_000 },
  );
  await writeFile(
    join(root, 'source.workflow.ts'),
    `import {defineWorkflow,phase,parallel,agent} from '@codex/workflows'; export default defineWorkflow({id:'synthetic-visible',async run(){const notes=await phase('Research',()=>parallel([()=>agent({label:'Agent A',model:'gpt-5.6-luna',reasoning:'low',prompt:'Synthetic A'}),()=>agent({label:'Agent B',model:'gpt-5.6-luna',reasoning:'low',prompt:'Synthetic B'})]));return phase('Finish',()=>agent({label:'Agent C',model:'gpt-5.6-sol',reasoning:'medium',prompt:'Synthetic C',input:notes}));}});`,
  );
  host = spawn(
    process.execPath,
    [
      new URL('./visibility-host.fixture.mjs', import.meta.url).pathname,
      root,
      workspace,
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  hostExit = new Promise((resolveExit) => host.once('exit', resolveExit));
  let count = 0;
  const lines = createInterface({ input: host.stdout });
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(
      () => reject(Error('SYNTHETIC_HOST_TIMEOUT')),
      10_000,
    );
    lines.on('line', (line) => {
      const value = JSON.parse(line);
      if (value.endpoint) {
        clearTimeout(timer);
        resolveEndpoint(value.endpoint);
      }
      if (value.event === 'started') count += 1;
    });
    host.once('exit', () => {
      clearTimeout(timer);
      reject(Error('SYNTHETIC_HOST_EXIT'));
    });
  });
  process.env.CAS_UI_SYNTHETIC_TOKEN_FILE = join(root, 'token');
  const revision = (
    await execute('git', ['rev-parse', 'HEAD'], { cwd: workspace })
  ).stdout.trim();
  const config = {
    hosts: [
      {
        hostId: 'synthetic',
        transport: 'remote-wss',
        endpoint,
        credentialRef: 'CAS_UI_SYNTHETIC_TOKEN_FILE',
        expectedVersion: '0.151.0',
        caCertificatePath: join(root, 'cert.pem'),
      },
    ],
    repositories: [
      {
        hostId: 'synthetic',
        repositoryId: 'fixture',
        checkoutPath: workspace,
        leaseRoot: join(root, 'leases'),
      },
    ],
    workflows: [],
    workflowSources: [
      {
        actorAgentId: 'codex-control',
        hostId: 'synthetic',
        repositoryId: 'fixture',
        assignmentId: 'cas-ui-fixture',
        baseRevision: revision,
        sourceRoot: root,
        runtimeProfile: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'low',
          sandbox: 'readOnly',
          approvalPolicy: 'never',
        },
      },
    ],
    viewer: {
      host: '127.0.0.1',
      port: 0,
      tokenFile: join(root, 'token'),
      uiDirectory: resolve('apps/codex-control-ui/dist'),
    },
  };
  runtime = await createProductionControlRuntime(
    database.daemonUrl,
    database.ownerUrl,
    config,
  );
  await runtime.start();
  const direct = process.argv.includes('--delegation');
  const response = await fetch(
    runtime.browserOrigin +
      '/api/control/' +
      (direct ? 'delegateAgent' : 'runWorkflow'),
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + 's'.repeat(64),
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        direct
          ? {
              idempotencyKey: 'synthetic-handoff',
              assignmentRef: 'Synthetic-A',
              assignmentDigest: 'sha256:' + 'a'.repeat(64),
              hostId: 'synthetic',
              workspace: {
                repositoryId: 'fixture',
                baseRevision: revision,
                assignmentId: 'cas-ui-handoff',
              },
              runtimeProfile: {
                model: 'gpt-5.6-luna',
                reasoningEffort: 'low',
                sandbox: 'readOnly',
                approvalPolicy: 'never',
              },
              completionBoundary: 'runtime-settled',
              prompt: 'Synthetic A',
            }
          : {
              source: 'source.workflow.ts',
              input: {},
              idempotencyKey: 'synthetic-ui',
            },
      ),
    },
  );
  const submitted = await response.json();
  if (!response.ok) throw Error(JSON.stringify(submitted));
  control = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/status')
        return Response.json({
          count,
          origin: runtime.browserOrigin,
          runId: submitted.runId,
          ...(!direct
            ? {
                workflow: await runtime.workflows.readWorkflow(submitted.runId),
              }
            : {}),
        });
      if (request.method !== 'POST')
        return new Response('Denied', { status: 405 });
      if (url.pathname === '/complete-a')
        host.stdin.write(JSON.stringify({ complete: 'thread-1' }) + '\n');
      else if (url.pathname === '/complete-b')
        host.stdin.write(JSON.stringify({ complete: 'thread-2' }) + '\n');
      else if (url.pathname === '/restart') {
        await runtime.stop();
        runtime = await createProductionControlRuntime(
          database.daemonUrl,
          database.ownerUrl,
          config,
        );
        await runtime.start();
      } else return new Response('Unknown', { status: 404 });
      return Response.json({ origin: runtime.browserOrigin });
    },
  });
  process.stdout.write(
    JSON.stringify({
      origin: runtime.browserOrigin,
      runId: submitted.runId,
      agentId: submitted.agentId,
      fixtureRoot: root,
      databaseName: database.databaseName,
      controlOrigin: 'http://127.0.0.1:' + control.port,
    }) + '\n',
  );
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
} catch (error) {
  console.error(error.message);
  await shutdown();
  process.exitCode = 1;
}
