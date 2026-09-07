import { describe, expect, it } from 'vitest';
import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
} from '../app-server-workflow.executor.js';
import type { AppServerInboundMessage } from '../../app-server-client/app-server-client.types.js';

function fixture(observer?: (event: Record<string, unknown>) => Promise<void>) {
  let begin: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    begin = resolve;
  });
  const calls: string[] = [];
  const connection: AppServerWorkflowConnection = {
    async request(method) {
      calls.push(method);
      if (method === 'thread/start')
        return { thread: { id: 'thread-a' } } as never;
      if (method === 'turn/start') {
        setTimeout(() => begin?.(), 0);
        return { turn: { id: 'turn-a' } } as never;
      }
      return {} as never;
    },
    async *messages(): AsyncGenerator<AppServerInboundMessage> {
      await started;
      yield {
        kind: 'notification',
        method: 'item/agentMessage/delta',
        params: { threadId: 'thread-a', itemId: 'item-a', delta: 'Live text' },
      };
      yield {
        kind: 'notification',
        method: 'item/completed',
        params: {
          threadId: 'thread-a',
          item: {
            id: 'image-a',
            type: 'imageGeneration',
            result: 'sensitive-image-bytes'.repeat(100_000),
          },
        },
      };
      yield {
        kind: 'notification',
        method: 'item/completed',
        params: {
          threadId: 'thread-a',
          item: {
            id: 'reason-a',
            type: 'reasoning',
            text: 'private-reasoning',
          },
        },
      };
      yield {
        kind: 'notification',
        method: 'item/completed',
        params: {
          threadId: 'thread-a',
          item: { id: 'item-a', type: 'agentMessage', text: 'Final text' },
        },
      };
      yield {
        kind: 'notification',
        method: 'turn/completed',
        params: {
          threadId: 'thread-a',
          turn: { id: 'turn-a', status: 'completed' },
        },
      };
    },
    async respond() {
      return undefined;
    },
    async reconnect() {
      throw new Error('No reconnect in fixture');
    },
  };
  const options = {
    connection,
    cwd: '/fixture',
    tempDirectory: '/fixture/.codex-workspace-tmp',
    sandbox: 'readOnly' as const,
    approvalPolicy: 'never' as const,
    onObservation: observer,
  };
  const executor = createAppServerWorkflowExecutor(options);
  const run = () =>
    executor.executeAgent({
      node: { id: 'node-a', model: 'gpt-5.6-luna', reasoning: 'low' },
      model: 'gpt-5.6-luna',
      reasoning: 'low',
      prompt: 'Synthetic only',
      signal: new AbortController().signal,
      onRuntimeEvent: async () => undefined,
    });
  return { executor, calls, run };
}

describe('[L1:INTEGRATION] scoped workflow visibility callback', () => {
  it('UIR1-PROVIDER supplies attributed text and image metadata, never private reasoning or image bytes', async () => {
    const seen: Record<string, unknown>[] = [];
    const f = fixture(async (event) => {
      seen.push(event);
    });
    try {
      await f.run();
      expect(seen.length).toBeGreaterThan(0);
      expect(
        seen.every(
          (event) => event.nodeId === 'node-a' && event.threadId === 'thread-a',
        ),
      ).toBe(true);
      expect(JSON.stringify(seen)).toContain('Live text');
      expect(JSON.stringify(seen)).toContain('Final text');
      expect(JSON.stringify(seen)).toContain('imageGeneration');
      expect(JSON.stringify(seen)).not.toContain('private-reasoning');
      expect(JSON.stringify(seen)).not.toContain('sensitive-image-bytes');
      expect(Buffer.byteLength(JSON.stringify(seen))).toBeLessThan(16_384);
    } finally {
      await f.executor.close();
    }
  });

  it('UIR1-PROVIDER-ERROR rejects observer failure and interrupts its owned turn', async () => {
    const f = fixture(async () => {
      throw new Error('observer-rejected');
    });
    try {
      await expect(f.run()).rejects.toThrow('observer-rejected');
      expect(f.calls).toContain('turn/interrupt');
    } finally {
      await f.executor.close();
    }
  });
});
