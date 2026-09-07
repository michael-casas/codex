import { describe, expect, it } from 'vitest';

import * as processPackage from '../../index.js';
import { transitionAgentMessage } from '../agent-messaging.js';

interface Handle {
  messageId: string;
  correlationId: string;
  state: string;
}

interface Submission {
  kind: 'send' | 'ask' | 'reply';
  idempotencyKey: string;
  fromAgentId: string;
  toAgentId: string;
  body: string;
  correlationId?: string;
  expiresAt?: string;
}

interface Messenger {
  send(
    input: Omit<Submission, 'kind'>,
    authorization: unknown,
  ): Promise<Handle>;
  ask(input: Omit<Submission, 'kind'>, authorization: unknown): Promise<Handle>;
  reply(
    input: Omit<Submission, 'kind'>,
    authorization: unknown,
  ): Promise<Handle>;
  pending(authorization: unknown): Promise<readonly Handle[]>;
}

type CreateMessenger = (repository: {
  submit(input: Submission): Promise<Handle>;
  pending(agentId: string): Promise<readonly Handle[]>;
}) => Messenger;

function messengerFactory(): CreateMessenger {
  const candidate = (processPackage as Record<string, unknown>)
    .createAgentMessenger;
  expect(
    candidate,
    'CAS-05 one-call messaging API is not implemented',
  ).toBeTypeOf('function');
  return candidate as CreateMessenger;
}

const authorization = {
  actorAgentId: 'agent-a',
  scopes: ['agent:message'],
};

// === L1: UNIT TESTS ===
describe('[L1:UNIT] durable agent messaging contract', () => {
  it('reduces delivery acceptance observation reply failure and expiry without collapsing states', () => {
    expect(transitionAgentMessage('queued', 'app-server-accepted')).toBe(
      'app-server-accepted',
    );
    expect(
      transitionAgentMessage('app-server-accepted', 'thread-observed'),
    ).toBe('thread-observed');
    expect(transitionAgentMessage('thread-observed', 'replied')).toBe(
      'replied',
    );
    expect(() => transitionAgentMessage('replied', 'queued')).toThrowError(
      expect.objectContaining({ code: 'MESSAGE_STATE_INVALID' }),
    );
  });

  it('CAS05-L1-ADVERSARIAL rejects invalid and unauthorized commands without a write', async () => {
    let writes = 0;
    const messenger = messengerFactory()({
      async submit() {
        writes += 1;
        return { messageId: 'm1', correlationId: 'c1', state: 'queued' };
      },
      async pending() {
        return [];
      },
    });

    await expect(
      messenger.send(
        {
          idempotencyKey: 'send-1',
          fromAgentId: 'agent-a',
          toAgentId: 'agent-b',
          body: 'x'.repeat(32_769),
        },
        authorization,
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_BODY_TOO_LARGE' });
    await expect(
      messenger.send(
        {
          idempotencyKey: 'send-2',
          fromAgentId: 'agent-a',
          toAgentId: 'agent-b',
          body: 'secret',
        },
        { actorAgentId: 'agent-c', scopes: ['agent:message'] },
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_UNAUTHORIZED' });
    await expect(
      messenger.reply(
        {
          idempotencyKey: 'reply-1',
          fromAgentId: 'agent-a',
          toAgentId: 'agent-b',
          body: 'reply',
        },
        authorization,
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_CORRELATION_REQUIRED' });
    await expect(
      messenger.send(
        {
          idempotencyKey: 'send-3',
          fromAgentId: 'agent-a',
          toAgentId: 'agent-b',
          body: 'expired',
          expiresAt: new Date(0).toISOString(),
        },
        authorization,
      ),
    ).rejects.toMatchObject({ code: 'MESSAGE_EXPIRED' });
    expect(writes).toBe(0);
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] one-call agent messaging', () => {
  it('CAS05-L1-MESSAGE sends asks and replies with one submission and stable correlation', async () => {
    const submissions: Submission[] = [];
    const messenger = messengerFactory()({
      async submit(input) {
        submissions.push(input);
        return {
          messageId: `message-${submissions.length}`,
          correlationId:
            input.correlationId ?? `correlation-${submissions.length}`,
          state: 'queued',
        };
      },
      async pending(agentId) {
        return agentId === 'agent-a'
          ? [
              {
                messageId: 'reply',
                correlationId: 'correlation-2',
                state: 'queued',
              },
            ]
          : [];
      },
    });

    const base = {
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      body: 'bounded body',
    };
    const sent = await messenger.send(
      { ...base, idempotencyKey: 'send-1' },
      authorization,
    );
    const asked = await messenger.ask(
      { ...base, idempotencyKey: 'ask-1' },
      authorization,
    );
    const replied = await messenger.reply(
      {
        ...base,
        idempotencyKey: 'reply-1',
        correlationId: asked.correlationId,
      },
      authorization,
    );

    expect(submissions.map(({ kind }) => kind)).toEqual([
      'send',
      'ask',
      'reply',
    ]);
    expect(submissions).toHaveLength(3);
    expect(sent).toEqual({
      messageId: 'message-1',
      correlationId: 'correlation-1',
      state: 'queued',
    });
    expect(replied.correlationId).toBe(asked.correlationId);
    expect(Object.keys(replied).sort()).toEqual([
      'correlationId',
      'messageId',
      'state',
    ]);
    await expect(messenger.pending(authorization)).resolves.toHaveLength(1);
  });
});
