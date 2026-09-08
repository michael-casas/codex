import { describe, expect, it } from 'vitest';

import {
  createControlDaemon,
  daemonStartupMessage,
  type DaemonResource,
} from './main.js';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] daemon scaffold startup', () => {
  it('retains the generated startup message without deepening daemon architecture', () => {
    expect(daemonStartupMessage).toBe('Codex control daemon ready');
  });

  it('CAS03-L1-DAEMON starts store then delivery and stops in reverse order', async () => {
    const calls: string[] = [];
    const resource = (name: string): DaemonResource => ({
      async start() {
        calls.push(`${name}:start`);
      },
      async stop() {
        calls.push(`${name}:stop`);
      },
    });
    const daemon = createControlDaemon(resource('store'), resource('delivery'));

    await daemon.start();
    await daemon.stop();
    await daemon.stop();

    expect(calls).toEqual([
      'store:start',
      'delivery:start',
      'delivery:stop',
      'store:stop',
    ]);
  });

  it('cleans the store when delivery startup fails', async () => {
    const calls: string[] = [];
    const store: DaemonResource = {
      async start() {
        calls.push('store:start');
      },
      async stop() {
        calls.push('store:stop');
      },
    };
    const delivery: DaemonResource = {
      async start() {
        calls.push('delivery:start');
        throw new Error('delivery failed');
      },
      async stop() {
        calls.push('delivery:stop');
      },
    };

    await expect(createControlDaemon(store, delivery).start()).rejects.toThrow(
      'delivery failed',
    );
    expect(calls).toEqual(['store:start', 'delivery:start', 'store:stop']);
  });

  it('attempts every shutdown even when both resources fail', async () => {
    const calls: string[] = [];
    const failing = (name: string): DaemonResource => ({
      async start() {
        calls.push(`${name}:start`);
      },
      async stop() {
        calls.push(name);
        throw new Error(`${name} failed`);
      },
    });
    const daemon = createControlDaemon(failing('store'), failing('delivery'));
    await daemon.start();

    await expect(daemon.stop()).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [expect.any(Error), expect.any(Error)],
    });
    expect(calls).toEqual(['store:start', 'delivery:start', 'delivery', 'store']);
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
