import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MonitorState } from './state.js';

describe('MonitorState', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function state(name: string, wakeId: string, marker: string): MonitorState {
    const directory = mkdtempSync(join(tmpdir(), 'codex-monitor-state-'));
    directories.push(directory);
    return new MonitorState(join(directory, name), wakeId, marker);
  }

  it('test_monotonic_dispatch_and_duplicate_rejection', () => {
    const monitor = state('state.json', 'wake-1', 'marker-1');
    monitor.transition('waiting');
    monitor.transition('condition_met');
    monitor.transition('request_accepted', {
      request_id: 3,
      turn_id: 'turn-1',
    });
    monitor.transition('turn_terminal_observed');
    monitor.transition('persisted_reconciled');
    expect(() =>
      monitor.transition('request_accepted', { request_id: 4 }),
    ).toThrow('invalid transition: persisted_reconciled -> request_accepted');
  });

  it('test_reconciled_marker_suppresses_duplicate_submission', () => {
    const monitor = state('state.json', 'wake-2', 'marker-2');
    monitor.transition('waiting');
    monitor.transition('condition_met');
    monitor.markPersistedWithoutSubmit('turn-existing');
    expect(monitor.shouldSubmit()).toBe(false);
    expect(monitor.snapshot.phase).toBe('persisted_reconciled');
  });
});
