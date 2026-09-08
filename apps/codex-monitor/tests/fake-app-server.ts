import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [mode = 'normal', storePath] = process.argv.slice(2);
let marker =
  storePath && existsSync(storePath) ? readFileSync(storePath, 'utf8') : null;

if (mode === 'silent' && storePath) {
  writeFileSync(`${storePath}.pid`, String(process.pid));
}

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line) as {
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  };
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize':
      send({
        id: message.id,
        result: {
          userAgent: 'fake',
          codexHome: '/tmp/fake-codex-home',
          platformFamily: 'unix',
          platformOs: 'darwin',
        },
      });
      break;
    case 'initialized':
      break;
    case 'thread/resume':
      send({
        id: message.id,
        result: { thread: { id: params.threadId, turns: [] } },
      });
      break;
    case 'turn/start': {
      if (mode === 'eof') process.exit(0);
      const input = params.input as Array<{ text: string }>;
      marker = input[0]?.text ?? null;
      if (storePath && marker !== null) writeFileSync(storePath, marker);
      send({
        id: message.id,
        result: {
          turn: { id: 'turn-fake', status: 'inProgress', items: [] },
        },
      });
      if (mode === 'silent') {
        setTimeout(() => process.exit(0), 2_000);
        break;
      }
      send({
        method: 'turn/started',
        params: {
          turn: { id: 'turn-fake', status: 'inProgress', items: [] },
        },
      });
      send({
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-fake',
            status: 'completed',
            items: [
              {
                type: 'userMessage',
                content: [{ type: 'text', text: marker }],
              },
            ],
          },
        },
      });
      break;
    }
    case 'thread/read':
      send({
        id: message.id,
        result: {
          thread: {
            id: params.threadId,
            turns: [
              {
                id: 'turn-fake',
                items: [{ text: marker, padding: 'x'.repeat(70_000) }],
              },
            ],
          },
        },
      });
      break;
  }
}
