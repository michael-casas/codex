import { describe, expect, it } from 'vitest';

import {
  dispatcherPrompt,
  stableStringify,
  validateRequest,
  wakeText,
} from './monitor-core.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] monitor contract', () => {
  it('timed request receives Pi-compatible defaults', () => {
    const request = validateRequest({
      condition: { kind: 'timed', seconds: 5 },
      memo: 'wake later',
    });
    expect(request.interval_seconds).toBe(10);
    expect(request.timeout_seconds).toBe(15);
    expect(request.background).toBe(true);
    expect(request.notify_on_complete).toBe(true);
    expect(request.on_timeout).toBe('exit_nonzero');
  });

  it('non-timed requests require a production timeout', () => {
    expect(() =>
      validateRequest({
        condition: { kind: 'file_exists', path: '/tmp/missing' },
        memo: 'bounded',
      }),
    ).toThrow(/timeout_seconds is required/);
  });

  it('deferred Pi kinds reject before arming', () => {
    expect(() =>
      validateRequest({
        condition: { kind: 'kanban_terminal', task_ids: ['task-1'] },
        memo: 'wait',
      }),
    ).toThrow(/Hermes-only/);
    expect(() =>
      validateRequest({
        condition: { kind: 'cmux_agent_stop', surface: 'surface:1' },
        memo: 'wait',
      }),
    ).toThrow(/deferred/);
  });

  it('wake events use the canonical MONITOR EVENT headline', () => {
    const content = wakeText({
      handleId: 'handle-1',
      outcome: 'met',
      status: 'completed',
      conditionKind: 'timed',
      target: { seconds: 2 },
      memo: 'continue',
      exitCode: 0,
    });
    expect(content.split('\n')[0]).toBe('MONITOR EVENT');
    expect(content).toMatch(/boomerang: same-thread/);
  });

  it('stable condition keys ignore object key order', () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(
      stableStringify({ a: 1, b: 2 }),
    );
  });

  it('scheduled dispatcher prompt is only the monitor skill invocation and handle', () => {
    const prompt = dispatcherPrompt({
      handle: '0f5aa658-8ea5-4d00-a7aa-e8a780e97fc2',
    });
    expect(prompt).toBe(
      '$monitor | handle: 0f5aa658-8ea5-4d00-a7aa-e8a780e97fc2',
    );
  });
});
