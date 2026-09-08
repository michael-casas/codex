import { describe, expect, it } from 'vitest';

import * as processPackage from '../../index.js';

type CreateDirectory = (repository: {
  register(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  read(agentId: string): Promise<Record<string, unknown> | undefined>;
  list(): Promise<readonly Record<string, unknown>[]>;
}) => {
  register(
    input: Record<string, unknown>,
    authorization: unknown,
  ): Promise<unknown>;
  read(agentId: string): Promise<unknown>;
  list(): Promise<unknown>;
};

// === L1: UNIT TESTS ===
describe('[L1:UNIT] durable agent directory', () => {
  it('CAS05-L1-DIRECTORY validates authorization and stable runtime identity', async () => {
    const candidate = (processPackage as Record<string, unknown>)
      .createAgentDirectory;
    expect(candidate, 'CAS-05 agent directory is not implemented').toBeTypeOf(
      'function',
    );
    let writes = 0;
    const directory = (candidate as CreateDirectory)({
      async register(input) {
        writes += 1;
        return input;
      },
      async read() {
        return undefined;
      },
      async list() {
        return [];
      },
    });
    const input = {
      agentId: 'agent-a',
      hostId: 'host-local',
      threadId: '0199ad00-0000-7000-8000-000000000001',
      sessionId: '0199ad00-0000-7000-8000-000000000002',
    };

    await expect(
      directory.register(input, {
        actorAgentId: 'agent-a',
        scopes: ['agent:register'],
      }),
    ).resolves.toEqual(input);
    await expect(
      directory.register(input, {
        actorAgentId: 'agent-b',
        scopes: ['agent:register'],
      }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_UNAUTHORIZED' });
    expect(writes).toBe(1);
  });
});
