import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { connectAppServer } from '../../../packages/codex/src/index.ts';
import { createAppServerHostRegistry } from '../../../packages/transport/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../.agent/artifacts/cas-docker-nextjs');
const secrets = resolve(root, 'secrets');
const env = {
  ...process.env,
  CAS_HOST_HOME: resolve(homedir(), '.codex'),
  CAS_TEST_ROOT: root,
};
const args = [
  'compose',
  '-p',
  'cas-nextjs-dogfood',
  '-f',
  resolve(here, 'compose.yaml'),
];
function docker(...extra) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('docker', [...args, ...extra], {
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(Error(`DOCKER_EXIT_${code}`)),
    );
  });
}
const action = process.argv[2] ?? 'prepare';
if (action === 'prepare') {
  await mkdir(resolve(root, 'app'), { recursive: true });
  await mkdir(secrets, { recursive: true, mode: 0o700 });
  const auth = await stat(resolve(env.CAS_HOST_HOME, 'auth.json'));
  if (!auth.isFile() || auth.mode & 0o077)
    throw Error('AUTH_MUST_BE_OWNER_ONLY');
  if (!(await stat(resolve(secrets, 'token')).catch(() => null))) {
    await writeFile(
      resolve(secrets, 'token'),
      randomBytes(32).toString('hex'),
      { mode: 0o600, flag: 'wx' },
    );
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '7',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        resolve(secrets, 'key.pem'),
        '-out',
        resolve(secrets, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
  }
  const file = resolve(root, 'app/package.json');
  if (!(await stat(file).catch(() => null)))
    await writeFile(
      file,
      JSON.stringify(
        {
          name: 'cas-remote-lab',
          version: '0.0.0',
          private: true,
          scripts: {
            build: 'next build',
            start: 'next start --hostname 0.0.0.0 --port 3000',
          },
          dependencies: {
            next: '16.3.4',
            react: '19.2.8',
            'react-dom': '19.2.8',
          },
        },
        null,
        2,
      ),
    );
  console.log(
    JSON.stringify({
      root,
      appUrl: 'http://127.0.0.1:13000',
      endpoint: 'wss://127.0.0.1:14501',
    }),
  );
} else if (action === 'up') {
  await docker('up', '-d', '--build', '--wait');
  const locked = await stat(resolve(root, 'app/package-lock.json')).catch(
    () => null,
  );
  await docker(
    'exec',
    '-T',
    '-u',
    'codex',
    'app-server',
    'npm',
    locked ? 'ci' : 'install',
    '--no-audit',
    '--no-fund',
  );
} else if (action === 'agent') {
  const registry = createAppServerHostRegistry({
    connectAppServer,
    resolveCredential: async () =>
      (await readFile(resolve(secrets, 'token'), 'utf8')).trim(),
  });
  registry.register({
    hostId: 'ubuntu-docker',
    transport: 'remote-wss',
    endpoint: 'wss://127.0.0.1:14501',
    credentialRef: 'CAS_DOCKER_TOKEN',
    expectedVersion: '0.151.0',
    caCertificatePath: resolve(secrets, 'cert.pem'),
  });
  const connection = await registry.connect('ubuntu-docker');
  const controller = new AbortController();
  let threadId, turnId;
  const evidence = {
    model: 'gpt-5.6-terra',
    effort: 'low',
    endpoint: 'wss://127.0.0.1:14501',
    status: 'running',
    messages: [],
  };
  const feed = (async () => {
    for await (const event of connection.messages({
      signal: controller.signal,
    })) {
      if (event.kind !== 'notification' || event.params?.threadId !== threadId)
        continue;
      if (
        event.method === 'item/completed' &&
        event.params.item?.type === 'agentMessage'
      ) {
        const text = event.params.item.text;
        evidence.messages.push(text);
        console.log(text);
      }
      if (event.method === 'turn/completed') {
        evidence.status = event.params.turn.status;
        break;
      }
    }
  })();
  try {
    const thread = await connection.request('thread/start', {
      model: evidence.model,
      cwd: '/workspace',
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });
    threadId = thread.thread.id;
    const turn = await connection.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: 'Read and execute /opt/cas/AGENT.md' }],
      model: evidence.model,
      effort: evidence.effort,
    });
    turnId = turn.turn.id;
    evidence.threadId = threadId;
    evidence.turnId = turnId;
    let timer;
    try {
      await Promise.race([
        feed,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('AGENT_TIMEOUT')), 900000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (evidence.status !== 'completed')
      throw Error(`AGENT_${evidence.status}`);
    await writeFile(
      resolve(root, 'agent-result.json'),
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    if (evidence.status === 'running' && turnId)
      await connection
        .request('turn/interrupt', { threadId, turnId })
        .catch(() => undefined);
    controller.abort();
    await connection.close();
    await feed.catch(() => undefined);
  }
} else if (action === 'serve') {
  await docker('up', '-d', '--wait', 'app-server');
  await docker('--profile', 'preview', 'up', '-d', '--wait', 'preview');
} else if (action === 'status') {
  await docker('ps');
  const response = await fetch('http://127.0.0.1:13000/api/health');
  if (!response.ok) throw Error('HEALTH_FAILED');
  const health = await response.json();
  if (health.status !== 'ok' || health.runtime !== 'ubuntu-codex')
    throw Error('WRONG_APP');
  console.log(JSON.stringify(health));
} else if (action === 'close') {
  await docker('--profile', 'preview', 'down', '--timeout', '20');
  await rm(secrets, { recursive: true, force: true });
  console.log(
    'Closed owned container/network; removed temporary TLS and capability files. App and evidence retained.',
  );
} else throw Error('Use prepare, up, agent, serve, status, or close');
