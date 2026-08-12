#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';

const tracePath = process.env.CODEX_TEST_TRACE;
const writeTrace = (record) => {
  if (tracePath) appendFileSync(tracePath, `${JSON.stringify(record)}\n`);
};

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const args = process.argv.slice(2);
const schemaIndex = args.indexOf('--output-schema');
const outputSchema =
  schemaIndex >= 0
    ? JSON.parse(readFileSync(args[schemaIndex + 1], 'utf8'))
    : null;
const resumeIndex = args.indexOf('resume');
const threadId = resumeIndex >= 0 ? args[resumeIndex + 1] : 'controlled-thread';
writeTrace({
  type: 'started',
  pid: process.pid,
  args,
  input,
  outputSchema,
  atMs: Date.now(),
});

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
emit({ type: 'thread.started', thread_id: threadId });
emit({ type: 'turn.started' });

if (input.includes('__COMMAND_EVIDENCE__')) {
  emit({
    type: 'item.completed',
    item: {
      id: 'command-1',
      type: 'command_execution',
      command: '/bounded/private-command --secret value',
      aggregated_output: 'private command output',
      exit_code: 0,
      status: 'completed',
    },
  });
}

if (input.includes('__HANG__')) {
  const keepAlive = setInterval(() => process.uptime(), 1_000);
  const finish = (signal) => {
    clearInterval(keepAlive);
    writeTrace({
      type: 'terminated',
      pid: process.pid,
      signal,
      atMs: Date.now(),
    });
    process.exit(0);
  };
  process.on('SIGTERM', () => finish('SIGTERM'));
  process.on('SIGINT', () => finish('SIGINT'));
  await new Promise(() => undefined);
}

const delay = /__DELAY_(\d+)__/.exec(input);
if (delay) {
  await new Promise((resolve) => setTimeout(resolve, Number(delay[1])));
}

if (input.includes('__FAIL__')) {
  emit({
    type: 'turn.failed',
    error: { message: 'controlled raw failure detail' },
  });
  writeTrace({ type: 'failed', pid: process.pid, atMs: Date.now() });
  process.exit(0);
}

let response;
if (input.includes('__INVALID_SCHEMA__')) {
  response = JSON.stringify({ accepted: 'not-a-boolean' });
} else if (input.includes('__CQRS__')) {
  response = 'cqrs-official-result';
} else if (input.includes('__GRAPHQL__')) {
  response = 'graphql-official-result';
} else if (input.includes('__CONSOLIDATE__')) {
  response =
    input.includes('cqrs-official-result') &&
    input.includes('graphql-official-result')
      ? 'decision-ready-resolver-factory-proposal'
      : 'missing-upstream-results';
} else {
  response = outputSchema
    ? JSON.stringify({ accepted: true })
    : `echo:${input}`;
}

emit({
  type: 'item.completed',
  item: {
    id: 'message-1',
    type: 'agent_message',
    text: response,
  },
});
emit({
  type: 'turn.completed',
  usage: {
    input_tokens: 3,
    cached_input_tokens: 1,
    output_tokens: 2,
    reasoning_output_tokens: 1,
  },
});
writeTrace({ type: 'completed', pid: process.pid, atMs: Date.now() });
