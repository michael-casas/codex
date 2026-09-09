import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  lstat,
  rm,
  readdir,
  realpath,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Client } from 'pg';
import { createControlDatabaseFixture } from '@codex/db/testing';
import {
  PostgresAgentDelegationRepository,
  PostgresAgentMessageStore,
} from '@codex/db';
import {
  createAgentMessenger,
  createDelegationService,
  type DelegateAgentCommand,
} from '@codex/process';
import {
  AgentMessageDeliveryRuntime,
  createAgentMessageDeliveryWorker,
} from '@codex/delivery';
import { createWorkspaceLeaseService } from '@codex/transport';

const exec = promisify(execFile);
export async function meadowLeaseScenario() {
  const root = await realpath(await mkdtemp('/tmp/meadow-lease-'));
  try {
    const checkoutPath = join(root, 'repo'),
      leaseRoot = join(root, 'leases');
    await mkdir(checkoutPath);
    await mkdir(leaseRoot);
    await exec('git', ['init', '-q', checkoutPath]);
    await exec('git', ['-C', checkoutPath, 'config', 'user.name', 'Fixture']);
    await exec('git', [
      '-C',
      checkoutPath,
      'config',
      'user.email',
      'fixture@example.test',
    ]);
    await writeFile(join(checkoutPath, 'keep'), 'base');
    await exec('git', ['-C', checkoutPath, 'add', '.']);
    await exec('git', ['-C', checkoutPath, 'commit', '-qm', 'fixture']);
    const baseRevision = (
      await exec('git', ['-C', checkoutPath, 'rev-parse', 'HEAD'])
    ).stdout.trim();
    await writeFile(join(checkoutPath, 'keep'), 'dirty');
    const host = {
      reconnect: async () => undefined,
      async request(method: string, p: Record<string, unknown>) {
        if (method === 'fs/getMetadata') {
          const s = await lstat(String(p.path));
          return {
            isDirectory: s.isDirectory(),
            isSymlink: s.isSymbolicLink(),
            isFile: s.isFile(),
          };
        }
        if (method === 'fs/writeFile') {
          await writeFile(
            String(p.path),
            Buffer.from(String(p.dataBase64), 'base64'),
          );
          return {};
        }
        if (method === 'fs/readFile')
          return {
            dataBase64: (await readFile(String(p.path))).toString('base64'),
          };
        assert.equal(method, 'command/exec');
        const [cmd, ...args] = p.command as string[];
        try {
          const r = await exec(cmd, args, { cwd: String(p.cwd) });
          return { exitCode: 0, ...r };
        } catch (e) {
          const r = e as { code: number; stdout: string; stderr: string };
          return { exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
        }
      },
    };
    const make = () =>
      createWorkspaceLeaseService({
        hosts: { connect: async () => host } as never,
        resolveRepository: async () => ({ checkoutPath, leaseRoot }),
      });
    const one = {
      hostId: 'fixture',
      repositoryId: 'repo',
      assignmentId: 'same-assignment',
      baseRevision,
      executionId: 'workflow-one',
    };
    const first = make(),
      a = await first.acquire(one);
    const b = await first.acquire({
      ...one,
      executionId: 'workflow-two',
    } as never);
    assert.notEqual(a.workspaceRef, b.workspaceRef);
    assert.deepEqual(await first.acquire(one), a);
    const restarted = make();
    assert.deepEqual(await restarted.acquire(one), a);
    const restored = await restarted.resolve(a.workspaceRef);
    assert.equal(await readFile(join(restored.cwd, 'keep'), 'utf8'), 'base');
    await writeFile(
      join(restored.cwd, '.codex-workspace-lease.json'),
      'foreign',
    );
    await assert.rejects(make().acquire(one), /ownership|marker/i);
    assert.equal(
      await readFile(join(restored.cwd, '.codex-workspace-lease.json'), 'utf8'),
      'foreign',
    );
    assert.equal(await readFile(join(checkoutPath, 'keep'), 'utf8'), 'dirty');
    await first.release(b.workspaceRef);
    return { isolated: true, recovered: true, foreignPreserved: true };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function meadowMessagingScenario() {
  const previous = process.cwd();
  let root = previous;
  while (!(await readdir(root)).includes('nx.json')) {
    const parent = dirname(root);
    if (parent === root) throw Error('WORKSPACE_NOT_FOUND');
    root = parent;
  }
  process.chdir(root);
  const db = await createControlDatabaseFixture();
  let delivery: AgentMessageDeliveryRuntime | undefined;
  const owner = new Client({ connectionString: db.ownerUrl });
  await owner.connect();
  try {
    const directory = resolve('migrations/process');
    for (const name of [
      '003_agent_messaging.sql',
      '004_agent_delegation.sql',
      ...(await readdir(directory)).filter((n) => n.startsWith('008_')),
    ])
      await owner.query(await readFile(join(directory, name), 'utf8'));
    delivery = new AgentMessageDeliveryRuntime(db.daemonUrl, db.ownerUrl);
    await delivery.start();
    const store = new PostgresAgentMessageStore(db.daemonUrl, delivery);
    let serial = 0;
    const turns = new Map<
      string,
      Array<{ id: string; status: string; items: unknown[] }>
    >();
    let delivered = 0;
    const host = {
      reconnect: async () => undefined,
      async request(method: string, p: Record<string, unknown> = {}) {
        if (method === 'thread/start') {
          const id = `thread-${++serial}`;
          turns.set(id, []);
          return { thread: { id, sessionId: `session-${serial}` } };
        }
        if (method === 'thread/read')
          return {
            thread: {
              status: { type: 'idle' },
              turns: turns.get(String(p.threadId)),
            },
          };
        if (method === 'turn/start') {
          const id = `turn-${++serial}`;
          const items = p.clientUserMessageId
            ? [{ clientId: p.clientUserMessageId, content: p.input }]
            : [];
          turns
            .get(String(p.threadId))!
            .push({ id, status: 'completed', items });
          if (items.length) delivered++;
          return { turn: { id } };
        }
        throw Error('UNEXPECTED_PROVIDER_METHOD');
      },
    };
    const repository = new PostgresAgentDelegationRepository(db.daemonUrl);
    const service = createDelegationService({
      repository,
      hosts: { connect: async () => host } as never,
      workspaces: {
        acquire: async () => ({ workspaceRef: 'fixture-owned' }),
        resolve: async () => ({ cwd: '/fixture' }),
        release: async () => undefined,
      },
    });
    const command: DelegateAgentCommand = {
      idempotencyKey: 'meadow-delegation',
      assignmentRef: 'fixture',
      assignmentDigest: `sha256:${'a'.repeat(64)}`,
      hostId: 'fixture',
      workspace: {
        repositoryId: 'repo',
        baseRevision: 'b'.repeat(40),
        assignmentId: 'assignment',
      },
      runtimeProfile: {
        model: 'gpt-5.6-luna',
        reasoningEffort: 'low',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      },
      completionBoundary: 'runtime-settled',
      prompt: 'fixture',
    };
    const auth = {
      actorAgentId: 'codex-control',
      scopes: ['control:delegate', 'control:message'],
    };
    const delegate = service.delegateAgent as (
      c: DelegateAgentCommand,
      a: typeof auth,
    ) => ReturnType<typeof service.delegateAgent>;
    const agent = await delegate(command, auth);
    const messenger = createAgentMessenger(
      new PostgresAgentMessageStore(db.daemonUrl, delivery),
    );
    const message = {
      idempotencyKey: 'meadow-message',
      fromAgentId: 'codex-control',
      toAgentId: agent.agentId,
      body: 'owned message',
    };
    const before = async () =>
      (
        await owner.query(
          'SELECT count(*)::int AS n FROM process.agent_message',
        )
      ).rows[0].n;
    const count = await before();
    await assert.rejects(
      messenger.send(message, { ...auth, actorAgentId: 'foreign' }),
    );
    await assert.rejects(
      messenger.send(
        { ...message, fromAgentId: 'foreign' },
        { ...auth, actorAgentId: 'foreign' },
      ),
    );
    await store.register({
      agentId: 'historical',
      hostId: 'fixture',
      threadId: 'historical-thread',
      sessionId: 'historical-session',
    });
    await assert.rejects(
      messenger.send({ ...message, toAgentId: 'historical' }, auth),
    );
    assert.equal(await before(), count);
    const first = await messenger.send(message, auth);
    assert.deepEqual(await messenger.send(message, auth), first);
    await assert.rejects(
      messenger.send({ ...message, body: 'conflict' }, auth),
      /IDEMPOTENCY_CONFLICT/,
    );
    await assert.rejects(
      messenger.reply(
        {
          ...message,
          idempotencyKey: 'bad-reply',
          correlationId: '00000000-0000-4000-8000-000000000099',
        },
        auth,
      ),
      /CORRELATION_INVALID/,
    );
    await delivery.work(
      createAgentMessageDeliveryWorker(store, {
        connect: async () => host,
      } as never),
    );
    for (
      let i = 0;
      i < 100 &&
      (await store.delivery(first.messageId)).state !== 'thread-observed';
      i++
    )
      await new Promise((r) => setTimeout(r, 50));
    assert.equal(
      (await store.delivery(first.messageId)).state,
      'thread-observed',
    );
    assert.equal(delivered, 1);
    assert.equal(await before(), count + 1);
    assert.equal(
      (
        await owner.query(
          'SELECT count(*)::int AS n FROM process.agent_runtime WHERE agent_id=$1',
          ['codex-control'],
        )
      ).rows[0].n,
      0,
    );
    const outbox = (
      await owner.query(
        'SELECT count(*)::int AS n FROM process.agent_message_outbox WHERE job_id IS NOT NULL',
      )
    ).rows[0].n;
    assert.equal(outbox, 1);
    return {
      ownedDelivered: true,
      foreignDenied: true,
      replayDeduplicated: true,
    };
  } finally {
    await delivery?.stop();
    await owner.end();
    await db.close();
    process.chdir(previous);
  }
}
