import type { AgentAuthorization } from '../agent-directory/agent-directory.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MAX_BODY_BYTES = 32_768;

export type AgentMessageKind = 'send' | 'ask' | 'reply';
export type AgentMessageState =
  | 'queued'
  | 'leased'
  | 'app-server-accepted'
  | 'thread-observed'
  | 'replied'
  | 'failed'
  | 'expired';

export interface AgentMessageSubmission {
  readonly kind: AgentMessageKind;
  readonly idempotencyKey: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly body: string;
  readonly correlationId?: string;
  readonly expiresAt?: string;
}

export interface AgentMessageHandle {
  readonly messageId: string;
  readonly correlationId: string;
  readonly state: AgentMessageState;
}

export interface AgentIncomingMessage extends AgentMessageHandle {
  readonly kind: AgentMessageKind;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly body: string;
}

export interface AgentMessageRepository {
  submit(input: AgentMessageSubmission): Promise<AgentMessageHandle>;
  pending(agentId: string): Promise<readonly AgentIncomingMessage[]>;
}

export class AgentMessageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentMessageError';
  }
}

const MESSAGE_TRANSITIONS: Readonly<
  Record<AgentMessageState, readonly AgentMessageState[]>
> = {
  queued: [
    'leased',
    'app-server-accepted',
    'thread-observed',
    'replied',
    'failed',
    'expired',
  ],
  leased: [
    'app-server-accepted',
    'thread-observed',
    'replied',
    'failed',
    'expired',
  ],
  'app-server-accepted': ['thread-observed', 'replied', 'failed', 'expired'],
  'thread-observed': ['replied', 'failed', 'expired'],
  replied: [],
  failed: [],
  expired: [],
};

export function transitionAgentMessage(
  current: AgentMessageState,
  next: AgentMessageState,
): AgentMessageState {
  if (current === next) return current;
  if (!MESSAGE_TRANSITIONS[current].includes(next)) {
    throw new AgentMessageError(
      'MESSAGE_STATE_INVALID',
      `Agent message cannot transition from ${current} to ${next}.`,
    );
  }
  return next;
}

function validate(
  input: AgentMessageSubmission,
  authorization: AgentAuthorization,
): void {
  if (
    authorization.actorAgentId !== input.fromAgentId ||
    !authorization.scopes.includes('agent:message')
  ) {
    throw new AgentMessageError(
      'MESSAGE_UNAUTHORIZED',
      'Agent message is not authorized.',
    );
  }
  if (
    !ID.test(input.idempotencyKey) ||
    !ID.test(input.fromAgentId) ||
    !ID.test(input.toAgentId) ||
    input.fromAgentId === input.toAgentId
  ) {
    throw new AgentMessageError(
      'MESSAGE_IDENTITY_INVALID',
      'Agent message identity is invalid.',
    );
  }
  const bodyBytes = Buffer.byteLength(input.body, 'utf8');
  if (bodyBytes === 0)
    throw new AgentMessageError('MESSAGE_BODY_EMPTY', 'Message body is empty.');
  if (bodyBytes > MAX_BODY_BYTES) {
    throw new AgentMessageError(
      'MESSAGE_BODY_TOO_LARGE',
      'Message body exceeds 32768 bytes.',
    );
  }
  if (input.kind === 'reply' && !input.correlationId) {
    throw new AgentMessageError(
      'MESSAGE_CORRELATION_REQUIRED',
      'Replies require a correlation identity.',
    );
  }
  if (input.correlationId && !ID.test(input.correlationId)) {
    throw new AgentMessageError(
      'MESSAGE_CORRELATION_INVALID',
      'Message correlation identity is invalid.',
    );
  }
  if (
    input.expiresAt !== undefined &&
    (!Number.isFinite(Date.parse(input.expiresAt)) ||
      Date.parse(input.expiresAt) <= Date.now())
  ) {
    throw new AgentMessageError(
      'MESSAGE_EXPIRED',
      'Message expiration must be in the future.',
    );
  }
}

export function createAgentMessenger(repository: AgentMessageRepository) {
  const submit = async (
    kind: AgentMessageKind,
    input: Omit<AgentMessageSubmission, 'kind'>,
    authorization: AgentAuthorization,
  ) => {
    const command = { ...input, kind };
    validate(command, authorization);
    return repository.submit(command);
  };
  return {
    send: (
      input: Omit<AgentMessageSubmission, 'kind'>,
      authorization: AgentAuthorization,
    ) => submit('send', input, authorization),
    ask: (
      input: Omit<AgentMessageSubmission, 'kind'>,
      authorization: AgentAuthorization,
    ) => submit('ask', input, authorization),
    reply: (
      input: Omit<AgentMessageSubmission, 'kind'>,
      authorization: AgentAuthorization,
    ) => submit('reply', input, authorization),
    pending: (authorization: AgentAuthorization) => {
      if (!authorization.scopes.includes('agent:message')) {
        throw new AgentMessageError(
          'MESSAGE_UNAUTHORIZED',
          'Agent messages are not authorized.',
        );
      }
      return repository.pending(authorization.actorAgentId);
    },
  };
}
