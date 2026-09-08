import { describe, expect, it } from 'vitest';
import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
  type AppServerWorkflowRequest,
} from '../app-server-workflow.executor.js';

const output = '{"answer":"RECOVERED_PAYLOAD"}';
const finalItem = () => ({
  id: 'item-a',
  type: 'agentMessage',
  phase: 'final_answer',
  text: output,
});
const boundTurn = () => ({
  id: 'turn-a',
  status: 'completed',
  items: [finalItem()],
});
const snapshot = () => ({
  thread: { id: 'thread-a', status: { type: 'idle' }, turns: [boundTurn()] },
});
const request = (): AppServerWorkflowRequest => ({
  node: { id: 'node-a', model: 'gpt-5.6-luna', reasoning: 'low' },
  model: 'gpt-5.6-luna',
  reasoning: 'low',
  prompt: 'Synthetic recovery only',
  outputSchema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
  signal: new AbortController().signal,
  onRuntimeEvent: () => undefined,
});

function fixture(value: unknown, readFailure?: Error) {
  const calls: { method: string; params: unknown }[] = [];
  const observations: Record<string, unknown>[] = [];
  const connection: AppServerWorkflowConnection = {
    async request<T>(method: string, params?: unknown): Promise<T> {
      calls.push({ method, params });
      if (method === 'thread/read') {
        if (readFailure) throw readFailure;
        return value as T;
      }
      if (method === 'thread/resume') return {} as T;
      throw Error('UNEXPECTED_PROVIDER_REQUEST:' + method);
    },
    async *messages({ signal } = {}) {
      await new Promise<void>((resolve) => {
        if (signal?.aborted) resolve();
        else signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      yield* [];
    },
    async respond() {
      throw Error('UNEXPECTED_SERVER_REQUEST');
    },
    async reconnect() {
      throw Error('UNEXPECTED_RECONNECT');
    },
  };
  const executor = createAppServerWorkflowExecutor({
    connection,
    cwd: '/fixture',
    tempDirectory: '/fixture/.codex-workspace-tmp',
    sandbox: 'readOnly',
    approvalPolicy: 'never',
    onObservation: (event) => {
      observations.push(event);
    },
  });
  return {
    executor,
    calls,
    observations,
    recover: () =>
      executor.reconcileAgent(request(), {
        nodeId: 'node-a',
        threadId: 'thread-a',
        turnId: 'turn-a',
      }),
  };
}

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] recovered final display provenance', () => {
  it('R2-RECOVERY-VERIFIED maps one actual matching final without live notifications or media leakage', async () => {
    const value = snapshot();
    value.thread.turns.unshift({
      id: 'wrong-turn',
      status: 'completed',
      items: [
        {
          id: 'wrong-item',
          type: 'agentMessage',
          phase: 'final_answer',
          text: 'WRONG_TURN_DECOY',
        },
      ],
    });
    const matching = value.thread.turns.at(-1);
    if (!matching) throw Error('TEST_MATCHING_TURN_MISSING');
    const f = fixture({
      thread: {
        ...value.thread,
        turns: [
          value.thread.turns[0],
          {
            ...matching,
            items: [
              {
                id: 'media-a',
                type: 'imageGeneration',
                status: 'completed',
                revisedPrompt: null,
                result: 'MEDIA_MUST_NOT_LEAK',
                failure: null,
              },
              ...matching.items,
            ],
          },
        ],
      },
    });
    try {
      expect(await f.recover()).toMatchObject({
        threadId: 'thread-a',
        finalResponse: output,
      });
      expect(f.observations).toHaveLength(1);
      expect(f.observations[0]).toMatchObject({
        nodeId: 'node-a',
        threadId: 'thread-a',
        turnId: 'turn-a',
        itemId: 'item-a',
        item: {
          threadId: 'thread-a',
          turnId: 'turn-a',
          itemId: 'item-a',
          itemType: 'agentMessage',
          operation: 'replace',
          messagePhase: 'final_answer',
          body: output,
        },
      });
      expect(JSON.stringify(f.observations)).not.toContain('WRONG_TURN_DECOY');
      expect(JSON.stringify(f.observations)).not.toContain(
        'MEDIA_MUST_NOT_LEAK',
      );
      expect(f.calls.filter((call) => call.method === 'thread/read')).toEqual([
        {
          method: 'thread/read',
          params: { threadId: 'thread-a', includeTurns: true },
        },
      ]);
      expect(
        f.calls.every((call) =>
          ['thread/resume', 'thread/read'].includes(call.method),
        ),
      ).toBe(true);
    } finally {
      await f.executor.close();
    }
  });

  it('R2-RECOVERY-BOUND-TURN chooses the matching final instead of a later unrelated turn', async () => {
    const value = snapshot();
    value.thread.turns.push({
      id: 'wrong-turn',
      status: 'completed',
      items: [
        {
          id: 'wrong-item',
          type: 'agentMessage',
          phase: 'final_answer',
          text: 'WRONG_TURN_DECOY',
        },
      ],
    });
    const f = fixture(value);
    try {
      expect(await f.recover()).toMatchObject({ finalResponse: output });
      expect(f.observations).toHaveLength(1);
      expect(JSON.stringify(f.observations)).not.toContain('wrong-turn');
      expect(f.calls.some((call) => call.method === 'turn/start')).toBe(false);
    } finally {
      await f.executor.close();
    }
  });

  it.each([
    [
      'missing thread id',
      { thread: { status: { type: 'idle' }, turns: [boundTurn()] } },
    ],
    [
      'wrong thread id',
      {
        thread: {
          id: 'wrong-thread',
          status: { type: 'idle' },
          turns: [boundTurn()],
        },
      },
    ],
    [
      'missing turn id',
      {
        thread: {
          id: 'thread-a',
          status: { type: 'idle' },
          turns: [{ status: 'completed', items: [finalItem()] }],
        },
      },
    ],
    [
      'wrong turn id',
      {
        thread: {
          id: 'thread-a',
          status: { type: 'idle' },
          turns: [{ ...boundTurn(), id: 'wrong-turn' }],
        },
      },
    ],
    [
      'missing item id',
      {
        thread: {
          id: 'thread-a',
          status: { type: 'idle' },
          turns: [
            {
              ...boundTurn(),
              items: [
                { type: 'agentMessage', phase: 'final_answer', text: output },
              ],
            },
          ],
        },
      },
    ],
  ])(
    'R2-RECOVERY-UNVERIFIED preserves prior valid output but emits no verified item for %s',
    async (_name, value) => {
      const f = fixture(value);
      try {
        expect(await f.recover()).toMatchObject({
          threadId: 'thread-a',
          finalResponse: output,
        });
        expect(f.observations).toEqual([]);
        expect(f.calls.some((call) => call.method === 'turn/start')).toBe(
          false,
        );
        expect(
          f.calls.filter((call) => call.method === 'thread/read'),
        ).toHaveLength(1);
      } finally {
        await f.executor.close();
      }
    },
  );

  it('R2-RECOVERY-PROVIDER-ERROR does not degrade a genuine provider rejection into output', async () => {
    const f = fixture(snapshot(), Error('SYNTHETIC_PROVIDER_FAILURE'));
    try {
      await expect(f.recover()).rejects.toThrow('SYNTHETIC_PROVIDER_FAILURE');
      expect(f.observations).toEqual([]);
      expect(f.calls.some((call) => call.method === 'turn/start')).toBe(false);
    } finally {
      await f.executor.close();
    }
  });
});
