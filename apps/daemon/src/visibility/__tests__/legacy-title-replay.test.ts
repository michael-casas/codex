import { describe, expect, it } from 'vitest';
import { normalizeVisibilityObservation } from '@codex/process';
import {
  createControlVisibilityProjector,
  type VisibilitySourceEvent,
} from '../control-visibility.projector.js';

const runId = `workflow_${'a'.repeat(64)}`;
const reference = `source.${'b'.repeat(64)}`;
const lifecycle = [
  ['workflow.accepted', 'queued'],
  ['workflow.execution.started', 'running'],
  ['workflow.started', 'running'],
  ['workflow.failed', 'failed'],
] as const;
function events(title?: string): VisibilitySourceEvent[] {
  return lifecycle.map(([kind], index) => ({
    eventId: `legacy-${index}`,
    sequence: String(index + 1),
    streamId: `workflow:${runId}`,
    kind,
    occurredAt: '2026-09-04T10:00:00.000Z',
    payload: {
      runId,
      ...(index === 0
        ? {
            workflowRef: reference,
            ...(title ? { display: { id: 'modern-workflow', title } } : {}),
          }
        : {}),
    },
  }));
}

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] legacy workflow visibility title replay', () => {
  it('R2-REPLAY-LEGACY-TITLE preserves historic source reference payload and stable event IDs', () => {
    const source = events();
    const expected = source.map((event, index) =>
      normalizeVisibilityObservation({
        eventId: `source:${event.eventId}`,
        source: 'workflow',
        kind: event.kind,
        occurredAt: event.occurredAt,
        workflowId: runId,
        status: lifecycle[index][1],
        title: reference,
      }),
    );
    const first = source.flatMap(createControlVisibilityProjector());
    expect(first.map((event) => event.eventId)).toEqual(
      source.map((event) => `source:${event.eventId}`),
    );
    expect(first).toEqual(expected);
    expect(source.flatMap(createControlVisibilityProjector())).toEqual(
      expected,
    );
  });

  it('R2-REPLAY-MODERN-TITLE preserves admitted human display metadata through lifecycle replay', () => {
    const source = events('Modern human title');
    const projected = source.flatMap(createControlVisibilityProjector());
    expect(projected).toHaveLength(4);
    expect(projected.map((event) => event.title)).toEqual(
      Array(4).fill('Modern human title'),
    );
    expect(projected.map((event) => event.eventId)).toEqual(
      source.map((event) => `source:${event.eventId}`),
    );
  });
});
