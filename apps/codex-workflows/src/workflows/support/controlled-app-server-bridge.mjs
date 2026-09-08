#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

if (process.argv.includes('--version')) {
  process.stdout.write('codex-cli 0.151.0\n');
  process.exit(0);
}

const controlledTurn = process.env.CODEX_WORKFLOWS_CONTROLLED_TURN_PATH;
if (!controlledTurn) throw new Error('Missing controlled turn path.');

const threads = new Map();
const active = new Map();
let sequence = 0;
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const record = (value) =>
  typeof value === 'object' && value !== null ? value : {};

function textInput(params) {
  return (Array.isArray(params.input) ? params.input : [])
    .map((item) => record(item))
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function complete(threadId, turnId, status, usage = null) {
  const thread = threads.get(threadId);
  if (thread) {
    thread.status = 'idle';
    thread.turns.push({
      id: turnId,
      status,
      items: thread.items,
      ...(usage ? { usage } : {}),
    });
  }
  send({
    method: 'turn/completed',
    params: {
      threadId,
      turn: { id: turnId, status, ...(usage ? { usage } : {}) },
    },
  });
}

function startControlledTurn(threadId, turnId, params) {
  const schemaRoot = params.outputSchema
    ? mkdtempSync(join(tmpdir(), 'codex-workflows-schema-'))
    : undefined;
  const args = [
    'exec',
    '--json',
    '--model',
    String(params.model ?? ''),
    '--config',
    `model_reasoning_effort=${JSON.stringify(params.effort ?? 'medium')}`,
  ];
  if (schemaRoot) {
    const schemaPath = join(schemaRoot, 'schema.json');
    writeFileSync(schemaPath, JSON.stringify(params.outputSchema));
    args.push('--output-schema', schemaPath);
  }
  const child = spawn(controlledTurn, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  active.set(turnId, { child, threadId, schemaRoot, completed: false });
  child.stdin.end(textInput(params));
  const lines = createInterface({ input: child.stdout });
  void (async () => {
    for await (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'turn.started') {
        send({ method: 'turn/started', params: { threadId, turnId } });
      } else if (event.type === 'item.completed') {
        const source = record(event.item);
        const item = {
          ...source,
          type: source.type === 'agent_message' ? 'agentMessage' : source.type,
        };
        threads.get(threadId)?.items.push(item);
        send({ method: 'item/completed', params: { threadId, item } });
      } else if (event.type === 'turn.completed') {
        active.get(turnId).completed = true;
        complete(threadId, turnId, 'completed', event.usage ?? null);
      } else if (event.type === 'turn.failed') {
        active.get(turnId).completed = true;
        complete(threadId, turnId, 'failed');
      }
    }
  })();
  child.once('exit', () => {
    const state = active.get(turnId);
    if (state && !state.completed) complete(threadId, turnId, 'interrupted');
    active.delete(turnId);
    if (schemaRoot) rmSync(schemaRoot, { force: true, recursive: true });
  });
}

for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  const params = record(message.params);
  if (message.method === 'initialize') {
    send({
      id: message.id,
      result: {
        userAgent: 'controlled-app-server',
        codexHome: '/',
        platformFamily: 'controlled',
        platformOs: process.platform,
      },
    });
  } else if (message.method === 'initialized') {
    continue;
  } else if (message.method === 'thread/start') {
    const threadId = `controlled-thread-${++sequence}`;
    threads.set(threadId, { status: 'idle', turns: [], items: [] });
    send({ id: message.id, result: { thread: { id: threadId } } });
  } else if (message.method === 'turn/start') {
    const threadId = String(params.threadId);
    const turnId = `controlled-turn-${sequence}`;
    const thread = threads.get(threadId);
    if (thread) {
      thread.status = 'active';
      thread.items = [];
    }
    send({ id: message.id, result: { turn: { id: turnId } } });
    startControlledTurn(threadId, turnId, params);
  } else if (message.method === 'turn/interrupt') {
    const turnId = String(params.turnId);
    active.get(turnId)?.child.kill('SIGTERM');
    send({ id: message.id, result: {} });
  } else if (message.method === 'thread/resume') {
    send({ id: message.id, result: { thread: { id: params.threadId } } });
  } else if (message.method === 'thread/read') {
    const threadId = String(params.threadId);
    const thread = threads.get(threadId) ?? {
      status: 'idle',
      turns: [],
      items: [],
    };
    send({
      id: message.id,
      result: {
        thread: {
          id: threadId,
          status: { type: thread.status },
          turns: thread.turns,
        },
      },
    });
  } else if ('id' in message) {
    send({ id: message.id, result: {} });
  }
}

for (const { child } of active.values()) child.kill('SIGTERM');
