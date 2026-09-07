import { execFile } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = await realpath(process.argv[2]);
const checkout = await realpath(process.argv[3]);
const threads = new Map();
const peers = new Set();
const readable = process.argv.includes('--readable')
  ? await import('./readable-visibility-events.fixture.mjs')
  : undefined;
const safePath = (value) => {
  const path = resolve(value);
  if (path !== root && !path.startsWith(root + sep) && path !== checkout)
    throw Error('FIXTURE_PATH_DENIED');
  return path;
};
const send = (peer, message) => peer.send(JSON.stringify(message));
function emit(peer, method, params) {
  send(peer, { method, params });
}
function complete(id) {
  const thread = threads.get(id);
  if (!thread || thread.done) return;
  if (readable) return readable.completeReadableTurn(id, thread, emit);
  thread.done = true;
  emit(thread.peer, 'item/completed', {
    threadId: id,
    item: {
      id: 'item-' + id,
      type: 'agentMessage',
      text: thread.label + ' final',
    },
  });
  emit(thread.peer, 'turn/completed', {
    threadId: id,
    turn: { id: thread.turnId, status: 'completed' },
  });
}
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  tls: {
    key: await readFile(root + '/key.pem'),
    cert: await readFile(root + '/cert.pem'),
  },
  fetch(request, server) {
    if (request.headers.get('authorization') !== 'Bearer ' + 's'.repeat(64))
      return new Response('Unauthorized', { status: 401 });
    if (server.upgrade(request)) return undefined;
    return new Response('Upgrade required', { status: 426 });
  },
  websocket: {
    open(peer) {
      peers.add(peer);
    },
    close(peer) {
      peers.delete(peer);
    },
    async message(peer, raw) {
      const message = JSON.parse(String(raw));
      if (message.id === undefined) return;
      const p = message.params ?? {};
      console.error('SYNTHETIC_METHOD', message.method);
      const reply = (result) => send(peer, { id: message.id, result });
      try {
        switch (message.method) {
          case 'initialize':
            reply({
              userAgent: 'codex/0.151.0',
              codexHome: root,
              platformFamily: 'unix',
              platformOs: process.platform,
            });
            break;
          case 'fs/getMetadata': {
            const value = await lstat(safePath(p.path));
            reply({
              isDirectory: value.isDirectory(),
              isSymlink: value.isSymbolicLink(),
            });
            break;
          }
          case 'fs/writeFile':
            await writeFile(
              safePath(p.path),
              Buffer.from(p.dataBase64, 'base64'),
            );
            reply({});
            break;
          case 'fs/readFile':
            reply({
              dataBase64: (await readFile(safePath(p.path))).toString('base64'),
            });
            break;
          case 'command/exec': {
            const privateTempMkdir =
              p.command?.length === 5 &&
              p.command[0] === 'mkdir' &&
              p.command[1] === '-m' &&
              p.command[2] === '700' &&
              p.command[3] === '--' &&
              safePath(p.command[4]) ===
                resolve(safePath(p.cwd), '.codex-workspace-tmp');
            if (
              !privateTempMkdir &&
              !['git', 'find', 'realpath', 'rm'].includes(p.command?.[0])
            )
              throw Error('FIXTURE_COMMAND_DENIED');
            const result = await execute(p.command[0], p.command.slice(1), {
              cwd: safePath(p.cwd),
              timeout: 10_000,
            }).then(
              (r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }),
              (e) => ({
                exitCode: Number(e.code) || 1,
                stdout: e.stdout ?? '',
                stderr: e.stderr ?? '',
              }),
            );
            if (result.exitCode !== 0)
              console.error(
                'SYNTHETIC_COMMAND_FAILURE',
                p.command[0],
                result.stderr.slice(0, 500),
              );
            reply(result);
            break;
          }
          case 'thread/start': {
            const id = 'thread-' + (threads.size + 1);
            threads.set(id, { peer, done: false });
            reply({ thread: { id } });
            break;
          }
          case 'turn/start': {
            const thread = threads.get(p.threadId);
            if (!thread) throw Error('THREAD_MISSING');
            thread.label = p.input?.[0]?.text?.includes('Synthetic B')
              ? 'Agent B'
              : p.input?.[0]?.text?.includes('Synthetic C')
                ? 'Agent C'
                : 'Agent A';
            thread.turnId = 'turn-' + p.threadId;
            reply({ turn: { id: thread.turnId } });
            if (readable)
              readable.startReadableTurn(
                p.threadId,
                thread,
                p.input?.[0]?.text ?? '',
                emit,
              );
            else
              emit(peer, 'item/agentMessage/delta', {
                threadId: p.threadId,
                itemId: 'item-' + p.threadId,
                delta: thread.label + ' live',
              });
            process.stdout.write(
              JSON.stringify({ event: 'started', threadId: p.threadId }) + '\n',
            );
            if (!readable && thread.label === 'Agent C')
              setTimeout(() => complete(p.threadId), 50);
            break;
          }
          case 'thread/read': {
            const t = threads.get(p.threadId);
            reply({
              thread: {
                id: p.threadId,
                status: { type: t?.done ? 'idle' : 'active' },
                turns: [
                  {
                    id: t?.turnId,
                    status: t?.done ? 'completed' : 'inProgress',
                    items: t?.done
                      ? [
                          {
                            type: 'agentMessage',
                            text: t.finalText ?? t.label + ' final',
                          },
                        ]
                      : [],
                  },
                ],
              },
            });
            break;
          }
          case 'turn/interrupt': {
            const t = threads.get(p.threadId);
            if (t && !t.done) {
              t.done = true;
              emit(peer, 'turn/completed', {
                threadId: p.threadId,
                turn: { id: t.turnId, status: 'interrupted' },
              });
            }
            reply({});
            break;
          }
          default:
            reply({});
        }
      } catch (error) {
        console.error('SYNTHETIC_RPC_FAILURE', message.method, error.message);
        send(peer, {
          id: message.id,
          error: { code: -32602, message: error.message },
        });
      }
    },
  },
});
process.stdout.write(
  JSON.stringify({ endpoint: 'wss://127.0.0.1:' + server.port }) + '\n',
);
for await (const line of createInterface({ input: process.stdin })) {
  const command = JSON.parse(line);
  if (readable && command.action)
    readable.handleReadableControl(command, threads, emit);
  if (command.complete) complete(command.complete);
  if (command.stop) break;
}
for (const peer of peers) peer.close();
await server.stop(true);
