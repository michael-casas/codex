import { describe, expect, it, vi } from 'vitest';

import { createControlSession } from './session';
import type { ControlClient, VisibilityResult } from './types';

const summary: VisibilityResult = {
  cursor: '1',
  changed: true,
  workflows: [],
};

// === L1: UNIT TESTS ===
describe('[L1:UNIT] CAS-10 visibility session', () => {
  it('owns one wait and cancels prior selection generations', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let activeWaits = 0;
    let maxActiveWaits = 0;
    const client: ControlClient = {
      callTool: vi.fn(async (name, args, options) => {
        calls.push({ name, args });
        if (name === 'get_control_snapshot') return summary;
        activeWaits += 1;
        maxActiveWaits = Math.max(maxActiveWaits, activeWaits);
        return await new Promise((_, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              activeWaits -= 1;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }),
    };
    const results: VisibilityResult[] = [];
    const session = createControlSession({
      client,
      onResult: (result) => results.push(result),
      onPhase: vi.fn(),
    });

    await session.start();
    await vi.waitFor(() => expect(activeWaits).toBe(1));
    await session.select('agent-ada');
    await vi.waitFor(() => expect(activeWaits).toBe(1));
    await session.select('agent-grace');
    await vi.waitFor(() => expect(activeWaits).toBe(1));
    await session.collapse();
    await vi.waitFor(() => expect(activeWaits).toBe(1));
    session.stop();
    await vi.waitFor(() => expect(activeWaits).toBe(0));

    expect(calls[0]).toEqual({ name: 'get_control_snapshot', args: {} });
    expect(
      calls.some(({ args }) => args['selectedAgentId'] === 'agent-ada'),
    ).toBe(true);
    expect(
      calls.some(({ args }) => args['selectedAgentId'] === 'agent-grace'),
    ).toBe(true);
    expect(maxActiveWaits).toBe(1);
    expect(results.length).toBeGreaterThan(0);
  });

  it('ignores a late result from an aborted prior selection', async () => {
    let resolveAda!: (result: VisibilityResult) => void;
    const client: ControlClient = {
      callTool: vi.fn(async (name, args, options) => {
        if (name === 'get_control_snapshot') {
          return {
            ...summary,
            details:
              args['selectedAgentId'] === 'agent-grace'
                ? { agentId: 'agent-grace', truncated: false, events: [] }
                : undefined,
          };
        }
        if (args['selectedAgentId'] === 'agent-ada') {
          return await new Promise((resolve) => {
            resolveAda = resolve;
            options?.signal?.addEventListener(
              'abort',
              () =>
                resolve({
                  ...summary,
                  details: {
                    agentId: 'agent-ada',
                    truncated: false,
                    events: [],
                  },
                }),
              { once: true },
            );
          });
        }
        return await new Promise((_, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    };
    const results: VisibilityResult[] = [];
    const session = createControlSession({
      client,
      onResult: (result) => results.push(result),
      onPhase: vi.fn(),
    });

    await session.start();
    await session.select('agent-ada');
    await vi.waitFor(() => expect(resolveAda).toBeTypeOf('function'));
    await session.select('agent-grace');
    await vi.waitFor(() =>
      expect(results.at(-1)?.details?.agentId).toBe('agent-grace'),
    );
    expect(
      results.some(({ details }) => details?.agentId === 'agent-ada'),
    ).toBe(false);
    session.stop();
  });
});
