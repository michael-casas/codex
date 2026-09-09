import { createInterface } from 'node:readline';
if (process.argv.includes('--version'))
  process.stdout.write('codex-cli 0.151.0\n');
else {
  const calls = [];
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    calls.push(message.method);
    const result =
      message.method === 'initialize'
        ? {
            userAgent: 'codex/0.151.0',
            codexHome: process.cwd(),
            platformFamily: 'unix',
            platformOs: process.platform,
          }
        : message.method === 'thread/read'
          ? {
              thread: {
                id: 'thread-fixture',
                status: { type: 'idle' },
                turns: [
                  { id: 'turn-fixture', status: 'interrupted', items: [] },
                ],
              },
            }
          : message.method === 'test/calls'
            ? calls
            : {};
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n',
    );
  }
}
