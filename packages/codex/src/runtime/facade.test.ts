import { afterEach, describe, expect, test } from 'vitest';

import {
  initializeCodexHost,
  resetCodexHostForTests,
  type CodexAdapter,
  type CodexAdapterThread,
  type CodexEvent,
  type CodexThreadRequest,
  type CodexTurnResult,
} from '../index.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===

afterEach(() => {
  resetCodexHostForTests();
});

const result: CodexTurnResult = {
  threadId: 'owned-thread',
  finalResponse: 'owned response',
  events: [
    { type: 'thread.started', threadId: 'owned-thread' },
    {
      type: 'item.completed',
      item: { id: 'message-1', type: 'agent_message', text: 'owned response' },
    },
  ],
  usage: null,
};

describe('[L1:INTEGRATION] Codex facade admission and release', () => {
  test('[L1:INTEGRATION] CDX-L1-002 returns only repository-owned buffered result fields', async () => {
    const requests: CodexThreadRequest[] = [];
    const thread: CodexAdapterThread = {
      id: 'owned-thread',
      async run(request) {
        requests.push(request);
        return result;
      },
      async *stream() {
        yield* result.events;
      },
    };
    const adapter: CodexAdapter = {
      startThread: () => thread,
      resumeThread: () => thread,
    };
    const host = initializeCodexHost({}, () => adapter);
    const actual = await host.runTurn({
      prompt: 'hello',
      model: 'gpt-5.1-codex',
      sandbox: 'read-only',
      approval: 'never',
    });

    expect(actual).toEqual(result);
    expect(requests).toEqual([
      expect.objectContaining({
        prompt: 'hello',
        model: 'gpt-5.1-codex',
        sandbox: 'read-only',
        approval: 'never',
      }),
    ]);
    expect(host.metrics()).toEqual({
      activeOperations: 0,
      threadLocks: 0,
      closing: false,
    });
  });

  test('[L1:INTEGRATION] CDX-L1-002 serializes concurrent resumes for one thread', async () => {
    let concurrent = 0;
    let maximum = 0;
    const thread: CodexAdapterThread = {
      id: 'same-thread',
      async run() {
        concurrent += 1;
        maximum = Math.max(maximum, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
        return result;
      },
      async *stream() {
        yield { type: 'turn.started' };
      },
    };
    const adapter: CodexAdapter = {
      startThread: () => thread,
      resumeThread: () => thread,
    };
    const host = initializeCodexHost({}, () => adapter);
    await Promise.all([
      host.runTurn({ prompt: 'one', threadId: 'same-thread' }),
      host.runTurn({ prompt: 'two', threadId: 'same-thread' }),
    ]);

    expect(maximum).toBe(1);
    expect(host.metrics().threadLocks).toBe(0);
  });

  test('[L1:INTEGRATION] CDX-L1-002 releases streaming operations on early consumer return', async () => {
    const thread: CodexAdapterThread = {
      id: 'stream-thread',
      async run() {
        return result;
      },
      async *stream() {
        yield { type: 'turn.started' };
        yield { type: 'turn.completed' };
      },
    };
    const adapter: CodexAdapter = {
      startThread: () => thread,
      resumeThread: () => thread,
    };
    const host = initializeCodexHost({}, () => adapter);
    for await (const event of host.streamTurn({ prompt: 'stream' })) {
      expect(event.type).toBe('turn.started');
      break;
    }
    expect(host.metrics()).toEqual({
      activeOperations: 0,
      threadLocks: 0,
      closing: false,
    });
  });

  test('[L1:INTEGRATION] CDX-L1-002 releases streaming operations after adapter error', async () => {
    const thread: CodexAdapterThread = {
      id: 'stream-thread',
      async run() {
        return result;
      },
      async *stream(): AsyncGenerator<CodexEvent> {
        yield { type: 'turn.started' };
        throw new Error('controlled stream failure');
      },
    };
    const adapter: CodexAdapter = {
      startThread: () => thread,
      resumeThread: () => thread,
    };
    const host = initializeCodexHost({}, () => adapter);
    const consume = async () => {
      for await (const event of host.streamTurn({ prompt: 'stream' })) {
        // The adapter error occurs after a real event is consumed.
        expect(event.type).toBe('turn.started');
      }
    };
    await expect(consume()).rejects.toThrow('controlled stream failure');
    expect(host.metrics().activeOperations).toBe(0);
  });
});
