import { describe, expect, it } from 'vitest';

import { agent, defineWorkflow, executeWorkflow, parallel } from '../index.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] App Server workflow node attribution', () => {
  it('CAS07-L1-NODE passes the frozen stable node to executeAgent', async () => {
    let observed: unknown;
    await executeWorkflow(
      defineWorkflow({
        id: 'cas07-node',
        run: () =>
          agent({
            label: 'Research',
            model: 'gpt-5.6-sol',
            reasoning: 'medium',
            prompt: 'research',
          }),
      }),
      {},
      {
        runId: 'run-cas07',
        async executeAgent(request) {
          observed = (request as unknown as { node?: unknown }).node;
          return { threadId: 'thread-1', finalResponse: 'done', usage: null };
        },
        async writeArtifact() {
          throw new Error('not used');
        },
        onEvent() {
          return undefined;
        },
      },
    );
    expect(observed).toMatchObject({
      id: 'cas07-node:001:research',
      model: 'gpt-5.6-sol',
      reasoning: 'medium',
    });
  });

  it('CAS-ETH-L1-005 freezes an explicit existing-thread target without runtime overrides', async () => {
    let observed: unknown;
    await executeWorkflow(
      defineWorkflow({
        id: 'existing-thread-node',
        run: () => agent({
          label: 'Continue review',
          prompt: 'Continue the review.',
          existingThread: {
            hostId: 'local',
            threadId: 'thread-existing',
            activeTurn: { behavior: 'reject' },
          },
        } as never),
      }),
      {},
      {
        runId: 'run-existing-thread-node',
        async executeAgent(request) {
          observed = request;
          return { threadId: 'thread-existing', finalResponse: 'done', usage: null };
        },
        async writeArtifact() { throw new Error('not used'); },
        onEvent() { return undefined; },
      },
    );
    expect(observed).toMatchObject({
      existingThread: {
        hostId: 'local',
        threadId: 'thread-existing',
        activeTurn: { behavior: 'reject' },
      },
      node: {
        existingThread: {
          hostId: 'local',
          threadId: 'thread-existing',
          activeTurn: { behavior: 'reject' },
        },
      },
    });
    expect(observed).not.toEqual(expect.objectContaining({ model: expect.anything(), reasoning: expect.anything() }));
  });

  it('CAS-ETH-L1-006 rejects duplicate host/thread claims before a second execution', async () => {
    let executions = 0;
    const target = {
      hostId: 'local',
      threadId: 'thread-shared',
      activeTurn: { behavior: 'reject' },
    };
    await expect(executeWorkflow(
      defineWorkflow({
        id: 'duplicate-existing-thread',
        maxConcurrency: 2,
        run: () => parallel([
          () => agent({ label: 'First', prompt: 'first', existingThread: target } as never),
          () => agent({ label: 'Second', prompt: 'second', existingThread: target } as never),
        ]),
      }),
      {},
      {
        runId: 'run-duplicate-existing-thread',
        async executeAgent() {
          executions += 1;
          return { threadId: 'thread-shared', finalResponse: 'done', usage: null };
        },
        async writeArtifact() { throw new Error('not used'); },
        onEvent() { return undefined; },
      },
    )).rejects.toMatchObject({ code: 'WORKFLOW_DEFINITION_INVALID' });
    expect(executions).toBeLessThanOrEqual(1);
  });
});
