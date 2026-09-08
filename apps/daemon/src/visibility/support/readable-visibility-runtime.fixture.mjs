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
import { readableTitle } from './readable-visibility-events.fixture.mjs';

const execute = promisify(execFile);
const workspace = process.cwd();
const token = 's'.repeat(64);
let database, root, runtime, host, hostExit, controls, submitted;
let closing;
const shutdown = () =>
  (closing ??= (async () => {
    const failures = [];
    const release = async (name, operation) => {
      try {
        await operation();
      } catch {
        failures.push(name);
      }
    };
    await release('runtime', async () => {
      if (submitted) await runtime.workflows.cancelWorkflow(submitted.runId);
      await runtime?.stop();
    });
    await release('controls', () => controls?.stop(true));
    await release('host', async () => {
      if (host?.exitCode === null)
        host.stdin.end(JSON.stringify({ stop: true }) + '\n');
      if (hostExit) {
        const exit = await hostExit;
        if (exit.code !== 0 || exit.signal !== null)
          throw Error('HOST_EXIT_INVALID');
      }
    });
    await release('database', () => database?.close());
    await release('root', () =>
      root ? rm(root, { recursive: true, force: true }) : undefined,
    );
    process.stdout.write(
      JSON.stringify({
        cleanup: failures.length ? 'failed' : 'complete',
        failures,
      }) + '\n',
    );
    if (failures.length) throw Error('READABLE_CLEANUP_FAILED');
  })());
const finish = () =>
  void shutdown().then(
    () => process.exit(0),
    () => process.exit(1),
  );
process.once('SIGTERM', finish);
process.once('SIGINT', finish);

try {
  database = await createRuntimeVisibilityDatabaseFixture();
  root = await realpath(await mkdtemp(join(tmpdir(), 'cas-ui-r2-native-')));
  process.stdout.write(
    JSON.stringify({ fixtureRoot: root, databaseName: database.databaseName }) +
      '\n',
  );
  await writeFile(
    join(root, 'ownership.json'),
    JSON.stringify({
      assignmentId: 'CAS-UI-R2',
      pid: process.pid,
      databaseName: database.databaseName,
    }),
    { mode: 0o600 },
  );
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
        if (file.startsWith('007') && error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (sql) await owner.query(sql);
    }
  } finally {
    await owner.end();
  }
  await mkdir(join(root, 'leases'));
  await writeFile(join(root, 'token'), token, { mode: 0o600 });
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
    join(root, 'readable.workflow.ts'),
    `import {defineWorkflow,parallel,agent} from '@codex/workflows'; export default defineWorkflow({id:'readable-market-launch',title:${JSON.stringify(readableTitle)},async run(){return parallel([()=>agent({label:'Writer',model:'gpt-5.6-luna',reasoning:'low',prompt:'R2 Writer',outputSchema:{type:'object',properties:{title:{type:'string'},status:{type:'string',enum:['ready','blocked']},notes:{type:'string'},count:{type:'integer'},enabled:{type:'boolean'}},required:['title','status','notes','count','enabled'],additionalProperties:false}}),()=>agent({label:'Companion',model:'gpt-5.6-luna',reasoning:'low',prompt:'R2 Companion'})]);}});`,
  );
  host = spawn(
    process.execPath,
    [
      new URL('./visibility-host.fixture.mjs', import.meta.url).pathname,
      root,
      workspace,
      '--readable',
      ...(process.argv.includes('--performance') ? ['--performance'] : []),
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  hostExit = new Promise((resolveExit) =>
    host.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  let count = 0;
  const lines = createInterface({ input: host.stdout });
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timer = setTimeout(
      () => reject(Error('READABLE_HOST_TIMEOUT')),
      10_000,
    );
    lines.on('line', (line) => {
      const value = JSON.parse(line);
      if (value.endpoint) {
        clearTimeout(timer);
        resolveEndpoint(value.endpoint);
      }
      if (value.event === 'started') count++;
    });
    host.once('exit', () => {
      clearTimeout(timer);
      reject(Error('READABLE_HOST_EXIT'));
    });
  });
  process.env.CAS_UI_R2_TOKEN_FILE = join(root, 'token');
  const revision = (
    await execute('git', ['rev-parse', 'HEAD'], { cwd: workspace })
  ).stdout.trim();
  const config = {
    hosts: [
      {
        hostId: 'readable',
        transport: 'remote-wss',
        endpoint,
        credentialRef: 'CAS_UI_R2_TOKEN_FILE',
        expectedVersion: '0.151.0',
        caCertificatePath: join(root, 'cert.pem'),
      },
    ],
    repositories: [
      {
        hostId: 'readable',
        repositoryId: 'fixture',
        checkoutPath: workspace,
        leaseRoot: join(root, 'leases'),
      },
    ],
    workflows: [],
    workflowSources: [
      {
        actorAgentId: 'codex-control',
        hostId: 'readable',
        repositoryId: 'fixture',
        assignmentId: 'cas-ui-r2',
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
  const response = await fetch(
    runtime.browserOrigin + '/api/control/runWorkflow',
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        source: 'readable.workflow.ts',
        input: {},
        idempotencyKey: 'readable-native',
      }),
    },
  );
  submitted = await response.json();
  if (!response.ok) throw Error('READABLE_SUBMISSION_FAILED');
  controls = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (request.headers.get('authorization') !== 'Bearer ' + token)
        return new Response('Denied', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/status')
        return Response.json({
          count,
          workflow: await runtime.workflows.readWorkflow(submitted.runId),
        });
      if (request.method !== 'POST')
        return new Response('Denied', { status: 405 });
      if (path === '/cancel')
        return Response.json(
          await runtime.workflows.cancelWorkflow(submitted.runId),
        );
      if (path === '/append-probe' && process.argv.includes('--performance')) {
        const index = Number(new URL(request.url).searchParams.get('index'));
        if (!Number.isInteger(index) || index < 0 || index >= 40)
          return new Response('Invalid probe', { status: 400 });
        host.stdin.write(
          JSON.stringify({ action: 'append-probe', index }) + '\n',
        );
        return Response.json({ accepted: true });
      }
      if (
        ![
          '/finalize-message',
          '/long-feed',
          '/append-feed',
          '/complete-writer',
          '/unknown',
        ].includes(path)
      )
        return new Response('Unknown', { status: 404 });
      host.stdin.write(JSON.stringify({ action: path.slice(1) }) + '\n');
      return Response.json({ accepted: true });
    },
  });
  process.stdout.write(
    JSON.stringify({
      origin: runtime.browserOrigin,
      runId: submitted.runId,
      fixtureRoot: root,
      databaseName: database.databaseName,
      title: readableTitle,
      controlOrigin: 'http://127.0.0.1:' + controls.port,
    }) + '\n',
  );
  for await (const line of createInterface({ input: process.stdin }))
    if (line === 'stop') break;
  await shutdown();
  process.exit(0);
} catch {
  console.error('READABLE_FIXTURE_FAILED');
  await shutdown().catch(() => undefined);
  process.exitCode = 1;
}
