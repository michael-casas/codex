import { describe, expect, it } from 'vitest';

import * as daemon from '../../main.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] durable intercom daemon lifecycle', () => {
  it('CAS05-L2-RESTART-REDACTION starts the worker and closes its pg-boss runtime', async () => {
    expect(
      (daemon as Record<string, unknown>).createAgentMessagingDaemon,
      'CAS-05 daemon messaging composition is not implemented',
    ).toBeTypeOf('function');
    expect(daemon.createProductionAgentMessagingDaemon).toBeTypeOf('function');
    const calls: string[] = [];
    let handler: ((messageId: string) => Promise<void>) | undefined;
    const delivery = {
      async start() {
        calls.push('delivery:start');
      },
      async work(next: (messageId: string) => Promise<void>) {
        calls.push('delivery:work');
        handler = next;
        return 'worker-1';
      },
      async stop() {
        calls.push('delivery:stop');
      },
    };
    const messaging = daemon.createAgentMessagingDaemon(
      {
        delivery: async () => ({ state: 'thread-observed' }),
        mark: async () => undefined,
      } as never,
      delivery as never,
      { connect: async () => ({}) } as never,
    );

    await messaging.start();
    await handler?.('message-1');
    await messaging.stop();
    expect(calls).toEqual(['delivery:start', 'delivery:work', 'delivery:stop']);
  });
});
