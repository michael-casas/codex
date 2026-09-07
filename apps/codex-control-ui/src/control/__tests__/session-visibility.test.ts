import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlSession } from '../session';
import type { VisibilityResult } from '../types';

afterEach(() => vi.useRealTimers());

describe('[L1:UNIT] visibility connection state', () => {
  it('UIR1-STATUS bounds reconnect attempts and retains last-known data while offline', async () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const results: VisibilityResult[] = [];
    let calls = 0;
    const last: VisibilityResult = { cursor: '1', changed: true, workflows: [{ id: 'run-a', label: 'Research', status: 'running', stateText: 'Running', steps: [] }] };
    const session = createControlSession({
      client: { async callTool(name) { if(name === 'get_control_snapshot') return last; calls++; throw Error('Unavailable'); } },
      onResult: result => { results.push(result); },
      onPhase: phase => { phases.push(phase); },
    });
    try {
      await session.start();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(phases).toContain('reconnecting');
      expect(phases).toContain('offline');
      expect(calls).toBeLessThanOrEqual(4);
      expect(results.at(-1)).toEqual(last);
      expect(phases).not.toContain('empty');
      const count = calls;
      session.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toBe(count);
    } finally { session.stop(); }
  });
});
