import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  shapeVisibilityResult,
  type NormalizedVisibilityEvent,
  type VisibilitySummary,
} from '@codex/process';
import { createRuntimeVisibilityDaemon } from '../runtime-visibility-daemon.js';

const runId = `workflow_${'a'.repeat(64)}`;
const agentId = (run: string, node: string) =>
  `agent:${createHash('sha256').update(`${run}\0${node}`).digest('hex')}`;
const occurredAt = '2026-09-04T10:00:00.000Z';
const source = (
  sequence: number,
  kind: string,
  payload: Record<string, unknown>,
) => ({
  sequence: String(sequence),
  streamId: `workflow:${runId}`,
  eventId: `event-${sequence}`,
  kind,
  occurredAt,
  payload,
});

function fixture(events: ReturnType<typeof source>[]) {
  const stored = new Map<string, NormalizedVisibilityEvent>();
  const summaries = new Map<string, VisibilitySummary>();
  const repository = {
    async ingest(event: NormalizedVisibilityEvent) {
      stored.set(event.eventId, event);
      const id =
        (event.source === 'workflow' ? event.workflowId : event.agentId) ??
        event.eventId;
      summaries.set(`${event.source}:${id}`, {
        ...event,
        id,
        cursor: String(stored.size),
      });
      return String(stored.size);
    },
    async snapshot() {
      return shapeVisibilityResult({
        cursor: String(stored.size),
        changed: true,
        summaries: [...summaries.values()],
      });
    },
    async wait() {
      return { cursor: String(stored.size), changed: false };
    },
  };
  const options = {
    coalesceIntervalMs: 50,
    async sourcePage(after: string) {
      return events.filter((event) => BigInt(event.sequence) > BigInt(after));
    },
  };
  return { daemon: createRuntimeVisibilityDaemon(repository, options), stored };
}

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] production control-event visibility projection', () => {
  it('UIR1-L1-PROGRESS replays accepted, node and terminal events with stable progress and labels', async () => {
    const events = [
      source(1, 'workflow.accepted', { runId, workflowRef: 'demo' }),
      source(2, 'workflow.started', { runId }),
      source(3, 'node.frozen', {
        runId,
        node: { id: 'demo:001:a', label: 'Builder A', phase: 'Research' },
      }),
      source(4, 'node.frozen', {
        runId,
        node: { id: 'demo:002:b', label: 'Builder B', phase: 'Research' },
      }),
      source(5, 'node.started', { runId, nodeId: 'demo:001:a' }),
      source(6, 'node.completed', { runId, nodeId: 'demo:001:a' }),
      source(7, 'node.failed', {
        runId,
        nodeId: 'demo:002:b',
        diagnostic: 'agent-failed',
      }),
      source(8, 'workflow.failed', { runId, diagnostic: 'execution-failed' }),
    ];
    const { daemon } = fixture(events);
    try {
      await daemon.start();
      const snapshot = await daemon.snapshot();
      expect(snapshot.workflows).toHaveLength(1);
      expect(snapshot.workflows?.[0]).toMatchObject({
        id: runId,
        status: 'failed',
        progressLabel: '1/2 agents completed',
      });
      expect(snapshot.workflows?.[0]?.steps[0]?.agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: agentId(runId, 'demo:001:a'),
            label: 'Builder A',
            status: 'completed',
          }),
          expect.objectContaining({
            id: agentId(runId, 'demo:002:b'),
            label: 'Builder B',
            status: 'failed',
          }),
        ]),
      );
    } finally {
      await daemon.stop();
    }
  });

  it('UIR1-L1-REPLAY preserves event identity and sanitizes diagnostics before projection', async () => {
    const event = source(1, 'workflow.failed', {
      runId,
      diagnostic: 'token=private-value /Users/alice/private',
    });
    const first = fixture([event]);
    const second = fixture([event]);
    try {
      await first.daemon.start();
      await second.daemon.start();
      expect(first.stored.size).toBeGreaterThan(0);
      expect([...first.stored.values()]).toEqual([...second.stored.values()]);
      expect(JSON.stringify([...first.stored.values()])).not.toContain(
        'private-value',
      );
      expect(JSON.stringify([...first.stored.values()])).not.toContain(
        '/Users/alice',
      );
    } finally {
      await first.daemon.stop();
      await second.daemon.stop();
    }
  });

  it('UIR1-L1-IDENTITY isolates identical definition-local node IDs in distinct runs', async () => {
    const secondRun = `workflow_${'b'.repeat(64)}`;
    const events = [runId, secondRun].flatMap((run, index) => [
      {
        ...source(index * 2 + 1, 'workflow.started', { runId: run }),
        streamId: `workflow:${run}`,
      },
      {
        ...source(index * 2 + 2, 'node.frozen', {
          runId: run,
          node: { id: 'same:001:a', label: 'Agent', phase: 'Research' },
        }),
        streamId: `workflow:${run}`,
      },
    ]);
    const { daemon } = fixture(events);
    try {
      await daemon.start();
      const workflows = (await daemon.snapshot()).workflows ?? [];
      expect(workflows).toHaveLength(2);
      expect(
        workflows.flatMap((workflow) =>
          workflow.steps.flatMap((step) =>
            step.agents.map((agent) => agent.id),
          ),
        ),
      ).toEqual([
        agentId(runId, 'same:001:a'),
        agentId(secondRun, 'same:001:a'),
      ]);
    } finally {
      await daemon.stop();
    }
  });
});
