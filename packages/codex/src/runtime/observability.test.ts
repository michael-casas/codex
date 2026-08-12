import { afterEach, describe, expect, test } from 'vitest';

import {
  initializeCodexHost,
  resetCodexHostForTests,
  type CodexAdapter,
  type CodexAdapterThread,
  type CodexHostConfig,
  type CodexOperationObservation,
  type CodexTurnResult,
} from '../index.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===

afterEach(() => {
  resetCodexHostForTests();
});

const result: CodexTurnResult = {
  threadId: 'observed-thread',
  finalResponse: 'owned response',
  events: [
    { type: 'thread.started', threadId: 'observed-thread' },
    {
      type: 'turn.completed',
      usage: {
        inputTokens: 3,
        cachedInputTokens: 1,
        cacheWriteInputTokens: 0,
        outputTokens: 2,
        reasoningOutputTokens: 1,
      },
    },
  ],
  usage: {
    inputTokens: 3,
    cachedInputTokens: 1,
    cacheWriteInputTokens: 0,
    outputTokens: 2,
    reasoningOutputTokens: 1,
  },
};

function fakeThread(options?: { fail?: boolean }): CodexAdapterThread {
  return {
    id: 'observed-thread',
    async run() {
      if (options?.fail) throw new Error('raw controlled adapter failure');
      return result;
    },
    async *stream() {
      yield { type: 'thread.started', threadId: 'observed-thread' };
      yield { type: 'turn.completed', usage: result.usage ?? undefined };
    },
  };
}

function host(
  observations: CodexOperationObservation[],
  options?: { fail?: boolean },
) {
  const thread = fakeThread(options);
  const adapter: CodexAdapter = {
    startThread: () => thread,
    resumeThread: () => thread,
  };
  const config: CodexHostConfig = {
    apiKey: 'api-key-must-not-appear',
    env: { SECRET_VALUE: 'environment-value-must-not-appear' },
    observe: (observation) => observations.push(observation),
  };
  return initializeCodexHost(config, () => adapter);
}

describe('[L1:INTEGRATION] secret-safe Codex operation observations', () => {
  test('[L1:INTEGRATION] SA-004 emits a bounded buffered success observation without raw prompt or secrets', async () => {
    const observations: CodexOperationObservation[] = [];
    const runtime = host(observations);
    await runtime.runTurn({
      prompt: 'prompt-must-not-appear',
      model: 'gpt-5.1-codex',
      sandbox: 'read-only',
      approval: 'never',
      workingDirectory: '/sensitive/worktree',
      outputSchema: { type: 'object' },
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toEqual(
      expect.objectContaining({
        operation: 'run',
        outcome: 'completed',
        threadId: 'observed-thread',
        durationMs: expect.any(Number),
        eventTypes: ['thread.started', 'turn.completed'],
        requested: expect.objectContaining({
          model: 'gpt-5.1-codex',
          sandbox: 'read-only',
          approval: 'never',
          workingDirectorySet: true,
          hasOutputSchema: true,
        }),
        effective: expect.objectContaining({
          model: 'gpt-5.1-codex',
          sandbox: 'read-only',
        }),
        sdkVersion: '0.147.0',
        fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }),
    );
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain('prompt-must-not-appear');
    expect(serialized).not.toContain('api-key-must-not-appear');
    expect(serialized).not.toContain('environment-value-must-not-appear');
    expect(serialized).not.toContain('/sensitive/worktree');
  });

  test('[L1:INTEGRATION] SA-004 classifies streamed early consumer termination and releases the host', async () => {
    const observations: CodexOperationObservation[] = [];
    const runtime = host(observations);
    for await (const event of runtime.streamTurn({ prompt: 'stream-secret' })) {
      expect(event.type).toBe('thread.started');
      break;
    }

    expect(observations).toEqual([
      expect.objectContaining({
        operation: 'stream',
        outcome: 'consumer-returned',
        threadId: 'observed-thread',
        eventTypes: ['thread.started'],
      }),
    ]);
    expect(runtime.metrics().activeOperations).toBe(0);
  });

  test('[L1:INTEGRATION] SA-004 classifies adapter failure without recording the raw error', async () => {
    const observations: CodexOperationObservation[] = [];
    const runtime = host(observations, { fail: true });
    await expect(
      runtime.runTurn({ prompt: 'failed-secret', threadId: 'observed-thread' }),
    ).rejects.toThrow('raw controlled adapter failure');

    expect(observations).toEqual([
      expect.objectContaining({
        operation: 'run',
        outcome: 'failed',
        threadId: 'observed-thread',
        errorClassification: 'adapter-error',
        eventTypes: [],
      }),
    ]);
    expect(JSON.stringify(observations)).not.toContain(
      'raw controlled adapter failure',
    );
  });
});
