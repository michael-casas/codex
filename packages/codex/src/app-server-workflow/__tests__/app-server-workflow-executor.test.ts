import { describe, expect, it } from 'vitest';

import type { AppServerInboundMessage } from '../../app-server-client/app-server-client.types.js';
import {
  createAppServerWorkflowExecutor,
  type AppServerWorkflowConnection,
} from '../app-server-workflow.executor.js';

class Feed {
  private values: Array<AppServerInboundMessage | Error> = [];
  private wake?: () => void;
  push(value: AppServerInboundMessage | Error) {
    this.values.push(value);
    this.wake?.();
  }
  async *read(signal?: AbortSignal): AsyncIterable<AppServerInboundMessage> {
    while (!signal?.aborted) {
      if (!this.values.length)
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      this.wake = undefined;
      const value = this.values.shift();
      if (value instanceof Error) throw value;
      if (value !== undefined) yield value;
    }
  }
}

describe('[L1:INTEGRATION] HOSTR1 stop obligations', () => {
  it('HOSTR1 bounds four unavailable stop obligations and rejects new work on a dead feed', async () => {
    const feed = new Feed();
    let sequence = 0;
    let interrupts = 0;
    let starts = 0;
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const executor = createAppServerWorkflowExecutor({
      cwd: '/synthetic',
      tempDirectory: '/synthetic/.codex-workspace-tmp',
      sandbox: 'readOnly',
      approvalPolicy: 'never',
      connection: {
        async request(method) {
          if (method === 'thread/start')
            return { thread: { id: `owned-${++sequence}` } } as never;
          if (method === 'turn/start') return { turn: { id: 'turn' } } as never;
          if (method === 'turn/interrupt') {
            interrupts++;
            return await new Promise<never>(() => undefined);
          }
          return {} as never;
        },
        messages: ({ signal } = {}) => feed.read(signal),
        async respond() {
          return undefined;
        },
        async reconnect() {
          return undefined;
        },
      },
    });
    const request = {
      node: { id: 'node', model: 'gpt-5.6-sol', reasoning: 'low' },
      model: 'gpt-5.6-sol',
      reasoning: 'low',
      prompt: 'synthetic',
      signal: new AbortController().signal,
      onRuntimeEvent(event: { type: string }) {
        if (event.type === 'turn.started' && ++starts === 4) ready();
      },
    };
    const outcomes = Array.from({ length: 4 }, () =>
      executor.executeAgent(request).then(
        () => 'unexpected',
        (error) => error.stopStatus as string,
      ),
    );
    await started;
    feed.push(
      Object.assign(new Error('synthetic oversized'), {
        code: 'MESSAGE_TOO_LARGE',
        retryable: false,
      }),
    );
    expect(await Promise.all(outcomes)).toEqual([
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(interrupts).toBe(4);
    // A terminal feed must reject before thread/start, not launch an unobservable fifth turn.
    const fifth = executor.executeAgent(request).then(
      () => 'unexpected',
      (error) => error.code as string,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const launched = sequence;
    await executor.close();
    await fifth;
    expect(launched).toBe(4);
  });
  it.each(['size', 'lost', 'close'] as const)(
    'HOSTR1 %s stops the owned turn or reports unknown without replaying media',
    async (scenario) => {
      const feed = new Feed();
      const calls: Array<{ method: string; includeTurns?: unknown }> = [];
      let reconnects = 0;
      const original = Object.assign(new Error('synthetic failure'), {
        code:
          scenario === 'size' ? 'MESSAGE_TOO_LARGE' : 'HOST_CONNECTION_LOST',
        retryable: false,
        observedBytes: 5000,
        limitBytes: 4096,
      });
      const connection: AppServerWorkflowConnection = {
        async request(method, params) {
          calls.push({
            method,
            includeTurns:
              params && typeof params === 'object' && !Array.isArray(params)
                ? params.includeTurns
                : undefined,
          });
          if (method === 'thread/start')
            return { thread: { id: 'owned' } } as never;
          if (method === 'turn/start')
            return { turn: { id: 'turn-owned' } } as never;
          if (scenario === 'lost') throw new Error('synthetic unavailable');
          if (method === 'thread/read')
            return { thread: { status: { type: 'idle' } } } as never;
          return {} as never;
        },
        messages: ({ signal } = {}) => feed.read(signal),
        async respond() {
          return undefined;
        },
        async reconnect() {
          reconnects++;
          if (scenario === 'lost') throw new Error('secondary failure');
        },
      };
      const executor = createAppServerWorkflowExecutor({
        connection,
        cwd: '/synthetic',
        tempDirectory: '/synthetic/.codex-workspace-tmp',
        sandbox: 'readOnly',
        approvalPolicy: 'never',
      });
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const outcome = executor
        .executeAgent({
          node: { id: 'one', model: 'gpt-5.6-sol', reasoning: 'low' },
          model: 'gpt-5.6-sol',
          reasoning: 'low',
          prompt: 'synthetic',
          signal: new AbortController().signal,
          onRuntimeEvent(event) {
            if (event.type === 'turn.started') started();
          },
        })
        .then(
          () => ({
            code: 'UNEXPECTED_SUCCESS',
            stopStatus: '',
            observedBytes: undefined as number | undefined,
          }),
          (error) => ({
            code: error?.code as string,
            stopStatus: error?.stopStatus as string,
            observedBytes: error?.observedBytes as number | undefined,
          }),
        );
      await ready;
      if (scenario === 'close') await executor.close();
      else feed.push(original);
      const result = await outcome;
      try {
        expect(result.stopStatus).toBe(
          scenario === 'lost' ? 'unknown' : 'confirmed',
        );
        if (scenario !== 'close') expect(result.code).toBe(original.code);
        if (scenario === 'size') expect(result.observedBytes).toBe(5000);
        expect(
          calls.filter((call) => call.method === 'turn/interrupt').length,
        ).toBe(1);
        expect(
          calls.some(
            (call) =>
              call.method === 'thread/read' && call.includeTurns === true,
          ),
        ).toBe(false);
        expect(reconnects).toBeLessThanOrEqual(1);
        expect(executor.metrics().activeTurns).toBe(0);
      } finally {
        await executor.close();
      }
    },
  );
});

describe('[L1:INTEGRATION] App Server workflow executor', () => {
  it('preserves exact placement/model/effort and completes concurrent bound turns', async () => {
    const feed = new Feed();
    const calls: Array<{ method: string; params?: unknown }> = [];
    let sequence = 0;
    const connection: AppServerWorkflowConnection = {
      async request(method, params) {
        calls.push({ method, params });
        if (method === 'thread/start')
          return { thread: { id: `thread-${++sequence}` } } as never;
        if (method === 'turn/start') {
          if (
            !params ||
            typeof params !== 'object' ||
            Array.isArray(params) ||
            typeof params.threadId !== 'string'
          )
            throw Error('EXPECTED_THREAD_ID');
          return {
            turn: { id: params.threadId.replace(/^thread-/, 'turn-') },
          } as never;
        }
        return {} as never;
      },
      messages: ({ signal } = {}) => feed.read(signal),
      async respond() {
        return undefined;
      },
      async reconnect() {
        return undefined;
      },
    };
    const executor = createAppServerWorkflowExecutor({
      connection,
      cwd: '/workspace',
      tempDirectory: '/workspace/.codex-workspace-tmp',
      sandbox: 'workspaceWrite',
      approvalPolicy: 'never',
    });
    const events: unknown[] = [];
    const run = (id: string) =>
      executor.executeAgent({
        node: { id, model: 'gpt-5.6-sol', reasoning: 'medium' },
        model: 'gpt-5.6-sol',
        reasoning: 'medium',
        prompt: id,
        signal: new AbortController().signal,
        onRuntimeEvent: (event) => void events.push(event),
      });
    const results = [run('node-a'), run('node-b')];
    await Promise.resolve();
    await Promise.resolve();
    for (const index of [1, 2]) {
      feed.push({
        kind: 'notification',
        method: 'item/completed',
        params: {
          threadId: `thread-${index}`,
          item: { type: 'agentMessage', text: `result-${index}` },
        },
      });
      feed.push({
        kind: 'notification',
        method: 'turn/completed',
        params: {
          threadId: `thread-${index}`,
          turn: { id: `turn-${index}`, status: 'completed' },
        },
      });
    }
    await expect(Promise.all(results)).resolves.toEqual([
      { threadId: 'thread-1', finalResponse: 'result-1', usage: null },
      { threadId: 'thread-2', finalResponse: 'result-2', usage: null },
    ]);
    expect(
      calls
        .filter(({ method }) => method === 'thread/start')
        .map(({ params }) => params),
    ).toEqual([
      {
        model: 'gpt-5.6-sol',
        cwd: '/workspace',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        serviceName: 'codex-workflows',
        config: {
          shell_environment_policy: {
            set: {
              TMPDIR: '/workspace/.codex-workspace-tmp',
              TMP: '/workspace/.codex-workspace-tmp',
              TEMP: '/workspace/.codex-workspace-tmp',
            },
          },
        },
      },
      {
        model: 'gpt-5.6-sol',
        cwd: '/workspace',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
        serviceName: 'codex-workflows',
        config: {
          shell_environment_policy: {
            set: {
              TMPDIR: '/workspace/.codex-workspace-tmp',
              TMP: '/workspace/.codex-workspace-tmp',
              TEMP: '/workspace/.codex-workspace-tmp',
            },
          },
        },
      },
    ]);
    expect(
      calls
        .filter(({ method }) => method === 'turn/start')
        .every(
          ({ params }) =>
            typeof params === 'object' &&
            params !== null &&
            'effort' in params &&
            params.effort === 'medium',
        ),
    ).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'turn.completed', nodeId: 'node-a' }),
        expect.objectContaining({ type: 'turn.completed', nodeId: 'node-b' }),
      ]),
    );
    await executor.close();
    expect(executor.metrics()).toEqual({ activeTurns: 0, closed: true });
  });

  it('reconciles a bound completed turn after disconnect without a duplicate start', async () => {
    const feed = new Feed();
    const calls: string[] = [];
    let reconnects = 0;
    const connection: AppServerWorkflowConnection = {
      async request(method) {
        calls.push(method);
        if (method === 'thread/start')
          return { thread: { id: 'thread-recover' } } as never;
        if (method === 'turn/start')
          return { turn: { id: 'turn-recover' } } as never;
        if (method === 'thread/read')
          return {
            thread: {
              status: { type: 'idle' },
              turns: [
                {
                  id: 'turn-recover',
                  status: 'completed',
                  items: [{ type: 'agentMessage', text: 'recovered' }],
                },
              ],
            },
          } as never;
        return {} as never;
      },
      messages: ({ signal } = {}) => feed.read(signal),
      async respond() {
        return undefined;
      },
      async reconnect() {
        reconnects += 1;
      },
    };
    const executor = createAppServerWorkflowExecutor({
      connection,
      cwd: '/workspace',
      tempDirectory: '/workspace/.codex-workspace-tmp',
      sandbox: 'workspaceWrite',
      approvalPolicy: 'never',
    });
    const events: Array<{ type: string }> = [];
    const result = executor.executeAgent({
      node: { id: 'node-recover', model: 'gpt-5.6-sol', reasoning: 'medium' },
      model: 'gpt-5.6-sol',
      reasoning: 'medium',
      prompt: 'recover',
      signal: new AbortController().signal,
      onRuntimeEvent: (event) => void events.push(event),
    });
    await Promise.resolve();
    await Promise.resolve();
    feed.push(new Error('disconnect'));
    await expect(result).resolves.toEqual({
      threadId: 'thread-recover',
      finalResponse: 'recovered',
      usage: null,
    });
    expect(reconnects).toBe(1);
    expect(calls.filter((method) => method === 'thread/start')).toHaveLength(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'runtime.reconnected' }),
      ]),
    );
    await executor.close();
  });
});
