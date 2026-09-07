import { describe, expect, it } from 'vitest';

import { agent, defineWorkflow, executeWorkflow } from '../index.js';

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
});
