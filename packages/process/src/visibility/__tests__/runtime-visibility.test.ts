import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import * as processApi from '../../index.js';

type Api = Record<string, unknown>;
const api = processApi as Api;

function functionFromApi(
  name: string,
): ((...args: unknown[]) => unknown) | undefined {
  const value = api[name];
  expect(value, `${name} must be exported by @codex/process`).toBeTypeOf(
    'function',
  );
  return typeof value === 'function'
    ? (value as (...args: unknown[]) => unknown)
    : undefined;
}

const observedAt = '2026-09-02T10:00:00.000Z';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] runtime visibility contracts', () => {
  it('CAS08-L1-NORMALIZE normalizes attributed App Server, workflow, delegation, and message observations without provider envelopes', () => {
    const normalize = functionFromApi('normalizeVisibilityObservation');
    if (!normalize) return;

    const events = [
      normalize({
        eventId: 'app-1',
        source: 'app-server',
        kind: 'turn.completed',
        occurredAt: observedAt,
        projectId: 'project-1',
        agentId: 'agent-1',
        status: 'completed',
      }),
      normalize({
        eventId: 'workflow-1',
        source: 'workflow',
        kind: 'workflow.progress',
        occurredAt: observedAt,
        projectId: 'project-1',
        workflowId: 'workflow-1',
        status: 'running',
        current: 2,
        total: 3,
      }),
      normalize({
        eventId: 'delegation-1',
        source: 'delegation',
        kind: 'delegation.status',
        occurredAt: observedAt,
        projectId: 'project-1',
        agentId: 'agent-2',
        status: 'running',
      }),
      normalize({
        eventId: 'message-1',
        source: 'message',
        kind: 'message.status',
        occurredAt: observedAt,
        projectId: 'project-1',
        agentId: 'agent-2',
        status: 'thread-observed',
      }),
    ] as Array<Record<string, unknown>>;

    expect(events.map(({ source }) => source)).toEqual([
      'app-server',
      'workflow',
      'delegation',
      'message',
    ]);
    expect(
      events.every((event) => !('method' in event) && !('params' in event)),
    ).toBe(true);
  });

  it('CAS08-L1-REDACT redacts credentials and paths, excludes reasoning and prompts, and truncates output before persistence', () => {
    const normalize = functionFromApi('normalizeVisibilityObservation');
    if (!normalize) return;

    expect(
      normalize({
        eventId: 'reasoning-1',
        source: 'app-server',
        kind: 'reasoning.delta',
        occurredAt: observedAt,
        agentId: 'agent-1',
        detail: { type: 'reasoning', body: 'private reasoning' },
      }),
    ).toBeNull();

    const normalized = normalize({
      eventId: 'command-1',
      source: 'app-server',
      kind: 'item.command-output.delta',
      occurredAt: observedAt,
      agentId: 'agent-1',
      itemId: 'item-1',
      prompt: 'must never persist',
      environment: { API_TOKEN: 'must never persist' },
      detail: {
        type: 'command',
        body: `token=super-secret /Users/example/private.txt ${'x'.repeat(5_000)}`,
      },
    }) as {
      detail: { body: string; truncated: boolean; originalBytes: number };
    };
    const serialized = JSON.stringify(normalized);

    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('/Users/example/private.txt');
    expect(serialized).not.toContain('must never persist');
    expect(
      Buffer.byteLength(normalized.detail.body, 'utf8'),
    ).toBeLessThanOrEqual(4_096);
    expect(normalized.detail).toMatchObject({ truncated: true });
    expect(normalized.detail.originalBytes).toBeGreaterThan(4_096);
  });

  it('CAS08-L1-SELECTION accepts detailed results only for the current selected-agent generation', () => {
    const accepts = functionFromApi('acceptVisibilityResult');
    if (!accepts) return;

    const oldResult = {
      cursor: '8',
      changed: true,
      selectedAgentId: 'agent-1',
      selectionId: 'selection-1',
      details: { agentId: 'agent-1', events: [] },
    };
    expect(
      accepts(
        { selectedAgentId: 'agent-2', selectionId: 'selection-2' },
        oldResult,
      ),
    ).toBe(false);
    expect(accepts({}, oldResult)).toBe(false);
    expect(
      accepts(
        { selectedAgentId: 'agent-1', selectionId: 'selection-1' },
        oldResult,
      ),
    ).toBe(true);
  });

  it('CAS08-L1-UI-HANDOFF shapes compact workflow-step-agent hierarchy, readable state, host appearance, and explicit feed state', () => {
    const shape = functionFromApi('shapeVisibilityResult');
    if (!shape) return;

    const result = shape({
      cursor: '4',
      changed: true,
      summaries: [
        {
          source: 'workflow',
          id: 'workflow-1',
          cursor: '3',
          authoritative: true,
          workflowId: 'workflow-1',
          stepId: 'research',
          agentId: 'agent-1',
          title: 'Build workflow',
          status: 'running',
          stateText: 'Running',
          current: 2,
          total: 3,
        },
        {
          source: 'delegation',
          id: 'agent-1',
          cursor: '4',
          authoritative: true,
          workflowId: 'workflow-1',
          stepId: 'research',
          agentId: 'agent-1',
          title: 'Research agent',
          status: 'blocked',
          stateText: 'Waiting for approval',
          ownership: 'adopted',
        },
      ],
    }) as Record<string, unknown>;

    expect(result).toMatchObject({
      appearance: 'host',
      feed: { state: 'collapsed' },
      workflows: [
        {
          id: 'workflow-1',
          label: 'Build workflow',
          status: 'running',
          stateText: 'Running',
          progressLabel: '2 of 3',
          steps: [
            {
              id: 'research',
              label: 'Research',
              agents: [
                {
                  id: 'agent-1',
                  label: 'Research agent',
                  status: 'blocked',
                  stateText: 'Waiting for approval',
                  ownership: 'adopted',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /color|gradient|font|layout|react/i,
    );

    expect(
      shape({
        cursor: '4',
        changed: true,
        summaries: [],
        selectedAgentId: 'agent-1',
        selectionId: 'selection-1',
      }),
    ).toMatchObject({
      feed: {
        state: 'selected',
        agentId: 'agent-1',
        selectionId: 'selection-1',
      },
    });
  });
});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] runtime visibility projection', () => {
  it('CAS08-L1-AUTHORITY coalesces advisory deltas while final item and turn observations remain authoritative', async () => {
    const create = functionFromApi('createRuntimeVisibilityIngestor');
    if (!create) return;
    const ingest = vi.fn(async (event: unknown) => {
      void event;
      return '1';
    });
    const visibility = create(
      { ingest },
      { coalesceIntervalMs: 60_000, maxCoalescedBytes: 4_096 },
    ) as {
      observe(value: unknown): Promise<void>;
      flush(): Promise<void>;
      stop(): Promise<void>;
    };

    for (let index = 0; index < 32; index += 1) {
      await visibility.observe({
        eventId: `delta-${index}`,
        source: 'app-server',
        kind: 'item.agent-message.delta',
        occurredAt: observedAt,
        agentId: 'agent-1',
        itemId: 'item-1',
        detail: { type: 'message', body: 'x' },
      });
    }
    expect(ingest).not.toHaveBeenCalled();
    await visibility.flush();
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      authoritative: false,
      detail: { body: 'x'.repeat(32) },
    });

    await visibility.observe({
      eventId: 'final-item',
      source: 'app-server',
      kind: 'item.completed',
      occurredAt: observedAt,
      agentId: 'agent-1',
      itemId: 'item-1',
      status: 'completed',
      detail: { type: 'message', body: 'authoritative final text' },
    });
    await visibility.observe({
      eventId: 'final-turn',
      source: 'app-server',
      kind: 'turn.completed',
      occurredAt: observedAt,
      agentId: 'agent-1',
      status: 'completed',
    });
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(ingest.mock.calls[1]?.[0]).toMatchObject({ authoritative: true });
    expect(ingest.mock.calls[2]?.[0]).toMatchObject({ authoritative: true });
    await visibility.stop();
  });

  it('CAS08-L1-BUDGET uses one repository call for snapshot or wait and validates bounded cursor waits', async () => {
    const create = functionFromApi('createRuntimeVisibilityService');
    if (!create) return;
    const snapshot = vi.fn(async (query: unknown) => {
      void query;
      return { cursor: '1', changed: true, summaries: [] };
    });
    const wait = vi.fn(async (query: unknown) => {
      void query;
      return { cursor: '1', changed: false };
    });
    const service = create({ snapshot, wait }) as {
      snapshot(query: unknown): Promise<unknown>;
      wait(query: unknown): Promise<unknown>;
    };

    await service.snapshot({
      selectedAgentId: 'agent-1',
      selectionId: 'selection-1',
    });
    await service.wait({
      afterCursor: '1',
      selectedAgentId: 'agent-1',
      selectionId: 'selection-1',
      waitMs: 0,
    });
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(1);
    await expect(
      service.wait({ afterCursor: '-1', waitMs: 30_001 }),
    ).rejects.toMatchObject({ code: 'VISIBILITY_QUERY_INVALID' });
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
