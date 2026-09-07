import { describe, expect, it } from 'vitest';

import * as dbApi from '@codex/db';
import * as dbTestingApi from '@codex/db/testing';
import * as daemonApi from '../../main.js';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] runtime visibility daemon', () => {
  it('CAS08-L2-DAEMON ingests normalized observations and serves one-call snapshot/wait across daemon reconstruction', async () => {
    const baselineFactory = (dbTestingApi as Record<string, unknown>)[
      'createControlDatabaseFixture'
    ];
    expect(baselineFactory).toBeTypeOf('function');
    if (typeof baselineFactory !== 'function') return;
    const baseline = (await baselineFactory()) as { close(): Promise<void> };
    try {
      const Repository = (dbApi as Record<string, unknown>)[
        'PostgresRuntimeVisibilityRepository'
      ];
      const create = (daemonApi as Record<string, unknown>)[
        'createRuntimeVisibilityDaemon'
      ];
      const visibilityFixture = (dbTestingApi as Record<string, unknown>)[
        'createRuntimeVisibilityDatabaseFixture'
      ];
      expect(Repository).toBeTypeOf('function');
      expect(create).toBeTypeOf('function');
      expect(visibilityFixture).toBeTypeOf('function');
      if (
        typeof Repository !== 'function' ||
        typeof create !== 'function' ||
        typeof visibilityFixture !== 'function'
      )
        return;
      await baseline.close();
      const database = (await visibilityFixture()) as {
        daemonUrl: string;
        ownerUrl: string;
        eventCount(): Promise<number>;
        close(): Promise<void>;
      };
      try {
        const first = create(
          new (Repository as new (url: string) => object)(database.daemonUrl),
          { coalesceIntervalMs: 60_000 },
        ) as {
          observe(value: unknown): Promise<void>;
          flush(): Promise<void>;
          snapshot(query: unknown): Promise<Record<string, unknown>>;
          wait(query: unknown): Promise<Record<string, unknown>>;
          stop(): Promise<void>;
        };
        for (let index = 0; index < 50; index += 1) {
          await first.observe({
            eventId: `daemon-delta-${index}`,
            source: 'app-server',
            kind: 'item.agent-message.delta',
            occurredAt: '2026-09-02T10:00:00.000Z',
            projectId: 'project-1',
            workflowId: 'workflow-1',
            agentId: 'agent-1',
            itemId: 'item-1',
            detail: { type: 'message', body: 'x' },
          });
        }
        await first.flush();
        await first.observe({
          eventId: 'daemon-final',
          source: 'app-server',
          kind: 'item.completed',
          occurredAt: '2026-09-02T10:00:01.000Z',
          projectId: 'project-1',
          workflowId: 'workflow-1',
          agentId: 'agent-1',
          itemId: 'item-1',
          status: 'completed',
          detail: { type: 'message', body: 'final' },
        });
        const snapshot = await first.snapshot({
          selectedAgentId: 'agent-1',
          selectionId: 'selection-1',
        });
        await first.stop();

        const restarted = create(
          new (Repository as new (url: string) => object)(database.daemonUrl),
        ) as {
          snapshot(query: unknown): Promise<Record<string, unknown>>;
          wait(query: unknown): Promise<Record<string, unknown>>;
          stop(): Promise<void>;
        };
        expect(
          await restarted.snapshot({
            selectedAgentId: 'agent-1',
            selectionId: 'selection-1',
          }),
        ).toEqual(snapshot);
        expect(
          await restarted.wait({
            afterCursor: snapshot.cursor,
            selectedAgentId: 'agent-1',
            selectionId: 'selection-1',
            waitMs: 0,
          }),
        ).toEqual({
          cursor: snapshot.cursor,
          changed: false,
          selectedAgentId: 'agent-1',
          selectionId: 'selection-1',
        });
        expect(await database.eventCount()).toBe(2);
        await restarted.stop();
      } finally {
        await database.close();
      }
    } finally {
      await baseline.close();
    }
  });
});
