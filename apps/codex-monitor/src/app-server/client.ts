import {
  APP_SERVER_PROTOCOL_VERSION,
  AppServerClientError,
  connectAppServer,
  type AppServerClient as SharedAppServerClient,
  type AppServerInboundMessage,
  type AppServerJson,
} from '@codex/codex';

export class AmbiguousDisconnect extends Error {
  override readonly name = 'AmbiguousDisconnect';
}

export interface TurnOutcome {
  turn_id: string;
  terminal: true;
  notifications: ReadonlyArray<Record<string, unknown>>;
}

function record(value: unknown): Record<string, AppServerJson> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, AppServerJson>)
    : undefined;
}

function ambiguous(error: unknown): error is AppServerClientError {
  return (
    error instanceof AppServerClientError && error.code === 'CONNECTION_CLOSED'
  );
}

function rawNotification(
  message: AppServerInboundMessage,
): Record<string, unknown> {
  return message.kind === 'notification'
    ? { method: message.method, params: message.params }
    : { id: message.id, method: message.method, params: message.params };
}

export class AppServerClient {
  constructor(
    private readonly command: readonly string[],
    private readonly timeout = 300,
  ) {
    if (command.length === 0) throw new Error('App Server command is required');
  }

  async submit(
    threadId: string,
    marker: string,
    options: { model?: string; effort?: string; cwd?: string } = {},
  ): Promise<TurnOutcome> {
    const client = await this.connect();
    let submitted = false;
    const notifications: Record<string, unknown>[] = [];
    try {
      await client.request('thread/resume', {
        threadId,
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        ...(options.model ? { model: options.model } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
      });
      submitted = true;
      const response = await client.request<Record<string, AppServerJson>>(
        'turn/start',
        {
          threadId,
          clientUserMessageId: marker,
          input: [{ type: 'text', text: marker }],
          ...(options.model ? { model: options.model } : {}),
          ...(options.effort ? { effort: options.effort } : {}),
          ...(options.cwd ? { cwd: options.cwd } : {}),
        },
      );
      const turn = record(response.turn);
      const turnId = turn?.id;
      if (typeof turnId !== 'string' || turnId.length === 0) {
        throw new Error('turn/start response did not contain a turn id');
      }
      const feedAbort = new AbortController();
      const timeoutMs = Math.max(1, Math.ceil(this.timeout * 1_000));
      let idleTimeout: ReturnType<typeof setTimeout> | undefined;
      const resetIdleTimeout = () => {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => feedAbort.abort(), timeoutMs);
      };
      try {
        resetIdleTimeout();
        for await (const message of client.messages({
          signal: feedAbort.signal,
        })) {
          resetIdleTimeout();
          notifications.push(rawNotification(message));
          if (
            message.kind === 'notification' &&
            ['turn/completed', 'turn/failed'].includes(message.method)
          ) {
            const params = record(message.params);
            const notifiedTurn = record(params?.turn);
            if (notifiedTurn?.id === turnId) {
              return { turn_id: turnId, terminal: true, notifications };
            }
          }
        }
      } finally {
        clearTimeout(idleTimeout);
      }
      throw new Error('App Server disconnected');
    } catch (error) {
      if (submitted && ambiguous(error)) {
        throw new AmbiguousDisconnect(
          'App Server disconnected after possible acceptance',
          { cause: error },
        );
      }
      throw error;
    } finally {
      await client.close();
    }
  }

  async readThread(threadId: string): Promise<Record<string, AppServerJson>> {
    const client = await this.connect();
    try {
      return await client.request<Record<string, AppServerJson>>(
        'thread/read',
        {
          threadId,
          includeTurns: true,
        },
      );
    } finally {
      await client.close();
    }
  }

  static containsMarker(value: unknown, marker: string): boolean {
    if (typeof value === 'string') return value.includes(marker);
    if (Array.isArray(value)) {
      return value.some((item) => AppServerClient.containsMarker(item, marker));
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some((item) =>
        AppServerClient.containsMarker(item, marker),
      );
    }
    return false;
  }

  private connect(): Promise<SharedAppServerClient> {
    const [command, ...serverArgs] = this.command;
    const requestTimeoutMs = Math.max(1, Math.ceil(this.timeout * 1_000));
    return connectAppServer({
      command,
      serverArgs,
      expectedVersion: APP_SERVER_PROTOCOL_VERSION,
      clientInfo: {
        name: 'codex_monitor_python_spike',
        title: 'Codex Monitor Python Spike',
        version: '0.1.0',
      },
      requestTimeoutMs,
      closeTimeoutMs: Math.min(2_000, Math.ceil(requestTimeoutMs / 2)),
    });
  }
}
