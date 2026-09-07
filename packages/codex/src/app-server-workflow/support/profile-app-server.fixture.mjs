import { createInterface } from 'node:readline';

if (process.argv.includes('--version')) {
  process.stdout.write('codex-cli 0.151.0\n');
} else {
  const send = (message) =>
    process.stdout.write(`${JSON.stringify(message)}\n`);
  const calls = [];
  let next = 0;
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    calls.push({ method: message.method, params: message.params });
    const respond = (result) =>
      send({ jsonrpc: '2.0', id: message.id, result });
    if (message.method === 'initialize')
      respond({
        userAgent: 'codex/0.151.0',
        codexHome: process.cwd(),
        platformFamily: 'unix',
        platformOs: process.platform,
      });
    else if (message.method === 'thread/start')
      respond({ thread: { id: `thread-${++next}` } });
    else if (message.method === 'turn/start') {
      const { threadId, model, effort } = message.params;
      if (effort === 'unsupported') {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: 'Unsupported model/effort combination',
          },
        });
        continue;
      }
      respond({ turn: { id: `turn-${next}` } });
      send({
        jsonrpc: '2.0',
        method: 'item/completed',
        params: {
          threadId,
          item: {
            type: 'agentMessage',
            text: JSON.stringify({ model, effort }),
          },
        },
      });
      send({
        jsonrpc: '2.0',
        method: 'turn/completed',
        params: { threadId, turn: { id: `turn-${next}`, status: 'completed' } },
      });
    } else if (message.method === 'test/calls') respond(calls);
    else respond({});
  }
}
