import { describe, expect, it } from 'vitest';
import { mapAppServerVisibility } from '../app-server-visibility.mapper.js';
import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
} from '../app-server-workflow.executor.js';
import type { AppServerInboundMessage } from '../../app-server-client/app-server-client.types.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] readable provider ownership', () => {
  it('R2-PROVIDER-METADATA retains a complete bounded final and typed phase/turn while excluding raw media', () => {
    const mapped = mapAppServerVisibility({
      kind: 'notification',
      method: 'item/completed',
      params: {
        threadId: 'thread-a',
        turnId: 'turn-a',
        item: {
          id: 'item-a',
          type: 'agentMessage',
          phase: 'final_answer',
          text: 'x'.repeat(6000),
        },
      },
    });
    expect(mapped?.item).toMatchObject({
      threadId: 'thread-a',
      turnId: 'turn-a',
      itemId: 'item-a',
      itemType: 'agentMessage',
      operation: 'replace',
      messagePhase: 'final_answer',
      body: 'x'.repeat(6000),
    });
    const media = mapAppServerVisibility({
      kind: 'notification',
      method: 'item/completed',
      params: {
        threadId: 'thread-a',
        turnId: 'turn-a',
        item: {
          id: 'image-a',
          type: 'imageGeneration',
          result: 'private-media',
        },
      },
    });
    expect(JSON.stringify(media)).not.toContain('private-media');
  });
  it('R2-PROVIDER-TURN refuses a mismatched turn before assigning visible activity', async () => {
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connection: AppServerWorkflowConnection = {
      async request(method) {
        if (method === 'thread/start')
          return { thread: { id: 'thread-a' } } as never;
        if (method === 'turn/start') {
          setTimeout(release, 0);
          return { turn: { id: 'turn-a' } } as never;
        }
        return {} as never;
      },
      async *messages(): AsyncGenerator<AppServerInboundMessage> {
        await started;
        yield {
          kind: 'notification',
          method: 'item/agentMessage/delta',
          params: {
            threadId: 'thread-a',
            turnId: 'wrong-turn',
            itemId: 'item-a',
            delta: 'foreign text',
          },
        };
        yield {
          kind: 'notification',
          method: 'item/completed',
          params: {
            threadId: 'thread-a',
            turnId: 'turn-a',
            item: {
              id: 'item-a',
              type: 'agentMessage',
              phase: 'final_answer',
              text: 'Owned final',
            },
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
        throw Error('UNEXPECTED_RECONNECT');
      },
    };
    const seen: unknown[] = [];
    const executor = createAppServerWorkflowExecutor({
      connection,
      cwd: '/fixture',
      tempDirectory: '/fixture/.codex-workspace-tmp',
      sandbox: 'readOnly',
      approvalPolicy: 'never',
      onObservation: (event) => {
        seen.push(event);
      },
    });
    try {
      await executor.executeAgent({
        node: { id: 'node-a', model: 'gpt-5.6-luna', reasoning: 'low' },
        model: 'gpt-5.6-luna',
        reasoning: 'low',
        prompt: 'Synthetic',
        signal: new AbortController().signal,
        onRuntimeEvent: () => undefined,
      });
      expect(JSON.stringify(seen)).not.toContain('foreign text');
      expect(JSON.stringify(seen)).toContain('Owned final');
    } finally {
      await executor.close();
    }
  });
});
