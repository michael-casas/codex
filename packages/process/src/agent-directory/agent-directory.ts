const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export interface AgentRuntimeRegistration {
  readonly agentId: string;
  readonly hostId: string;
  readonly threadId: string;
  readonly sessionId?: string;
}

export interface AgentAuthorization {
  readonly actorAgentId: string;
  readonly scopes: readonly string[];
}

export interface AgentDirectoryRepository {
  register(input: AgentRuntimeRegistration): Promise<AgentRuntimeRegistration>;
  read(agentId: string): Promise<AgentRuntimeRegistration | undefined>;
  list(): Promise<readonly AgentRuntimeRegistration[]>;
}

export class AgentDirectoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentDirectoryError';
  }
}

function validId(value: string): boolean {
  return ID.test(value);
}

export function createAgentDirectory(repository: AgentDirectoryRepository) {
  return {
    async register(
      input: AgentRuntimeRegistration,
      authorization: AgentAuthorization,
    ): Promise<AgentRuntimeRegistration> {
      if (
        authorization.actorAgentId !== input.agentId ||
        !authorization.scopes.includes('agent:register')
      ) {
        throw new AgentDirectoryError(
          'DIRECTORY_UNAUTHORIZED',
          'Agent registration is not authorized.',
        );
      }
      if (
        !validId(input.agentId) ||
        !validId(input.hostId) ||
        !validId(input.threadId) ||
        (input.sessionId !== undefined && !validId(input.sessionId))
      ) {
        throw new AgentDirectoryError(
          'DIRECTORY_IDENTITY_INVALID',
          'Agent runtime identity is invalid.',
        );
      }
      return repository.register(input);
    },
    read(agentId: string) {
      if (!validId(agentId))
        throw new AgentDirectoryError(
          'DIRECTORY_IDENTITY_INVALID',
          'Agent identity is invalid.',
        );
      return repository.read(agentId);
    },
    list() {
      return repository.list();
    },
  };
}
