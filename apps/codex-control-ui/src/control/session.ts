import type { ControlClient, ControlPhase, VisibilityResult } from './types';
import { mergeVisibleItems, revision } from './visible-items.reducer';

export interface ControlSession {
  start(): Promise<void>;
  select(agentId: string): Promise<void>;
  collapse(): Promise<void>;
  retry(): Promise<void>;
  stop(): void;
}

export interface ControlSessionOptions {
  readonly client: ControlClient;
  readonly initialAgentId?: string;
  readonly onResult: (result: VisibilityResult) => void;
  readonly onPhase: (phase: ControlPhase, message?: string) => void;
}

export function createControlSession(
  options: ControlSessionOptions,
): ControlSession {
  let stopped = false;
  let generation = 0;
  let cursor = '0';
  let selectedAgentId = options.initialAgentId;
  let pending: AbortController | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let lastResult: VisibilityResult | undefined;
  const cancelled = new Set<string>();
  const cancelledAgents = new Set<string>();

  const accept = (result: VisibilityResult) => {
    if (revision(result.cursor) < revision(cursor)) return;
    for (const workflow of result.workflows ?? []) {
      if (workflow.status === 'cancelled') {
        cancelled.add(workflow.id);
        for (const step of workflow.steps)
          for (const agent of step.agents) cancelledAgents.add(agent.id);
      }
    }
    const selectionCancelled = [
      ...(result.workflows ?? []),
      ...(lastResult?.workflows ?? []),
    ].some(
      (workflow) =>
        cancelled.has(workflow.id) &&
        workflow.steps.some((step) =>
          step.agents.some((agent) => agent.id === selectedAgentId),
        ),
    );
    if (selectionCancelled) {
      selectedAgentId = undefined;
      generation += 1;
      pending?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    const previousDetails =
      selectedAgentId && lastResult?.details?.agentId === selectedAgentId
        ? lastResult.details
        : undefined;
    const incomingDetails =
      result.details?.agentId === selectedAgentId ? result.details : undefined;
    let details = previousDetails;
    if (incomingDetails) {
      const events = [
        ...new Map(
          [
            ...(previousDetails?.events ?? []),
            ...(incomingDetails.events ?? []),
          ].map((event) => [event.eventId, event]),
        ).values(),
      ];
      details = {
        ...incomingDetails,
        truncated:
          incomingDetails.truncated ||
          previousDetails?.truncated === true ||
          events.length > 100,
        events: events.slice(-100),
        ...(incomingDetails.items
          ? {
              items: mergeVisibleItems(
                previousDetails?.items ?? [],
                incomingDetails.items,
                incomingDetails.agentId,
              ),
            }
          : previousDetails?.items
            ? { items: previousDetails.items }
            : {}),
      };
    }
    const merged = { ...lastResult, ...result };
    if (merged.workflows)
      merged.workflows = merged.workflows.filter(
        (workflow) => !cancelled.has(workflow.id),
      );
    if (cancelled.size) merged.cancelledWorkflowIds = [...cancelled];
    if (cancelledAgents.size) merged.cancelledAgentIds = [...cancelledAgents];
    if (result.workflows && result.summariesTruncated === undefined)
      delete merged.summariesTruncated;
    if (details) merged.details = details;
    else delete merged.details;
    lastResult = merged;
    cursor = result.cursor;
    options.onResult(lastResult);
    if (selectionCancelled) void wait(generation);
  };
  const connected = () =>
    options.onPhase(
      lastResult?.workflows?.length === 0 && !lastResult.summariesTruncated
        ? 'empty'
        : 'ready',
    );

  const selection = () =>
    selectedAgentId
      ? {
          selectedAgentId,
          selectionId: `selection-${generation}`,
        }
      : {};
  const message = (error: unknown) =>
    error instanceof Error
      ? error.message.slice(0, 240)
      : 'Control gateway unavailable';

  const wait = async (currentGeneration: number): Promise<void> => {
    if (stopped || currentGeneration !== generation) return;
    const controller = new AbortController();
    pending = controller;
    try {
      while (!stopped && currentGeneration === generation) {
        const result = await options.client.callTool(
          'wait_control_delta',
          {
            afterCursor: cursor,
            waitMs: 30_000,
            ...selection(),
          },
          { signal: controller.signal },
        );
        if (stopped || currentGeneration !== generation) return;
        if (revision(result.cursor) < revision(cursor)) continue;
        if (!result.changed) cursor = result.cursor;
        failures = 0;
        if (result.changed) accept(result);
        connected();
      }
    } catch (error) {
      if (
        !stopped &&
        currentGeneration === generation &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        failures += 1;
        options.onPhase(
          failures >= 4 ? 'offline' : 'reconnecting',
          message(error),
        );
        if (failures < 4)
          reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            void wait(currentGeneration);
          }, 100);
      }
    } finally {
      if (pending === controller) pending = undefined;
    }
  };

  const load = async (): Promise<void> => {
    if (stopped) return;
    generation += 1;
    const currentGeneration = generation;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    pending?.abort();
    failures = 0;
    const controller = new AbortController();
    pending = controller;
    options.onPhase(lastResult ? 'reconnecting' : 'loading');
    try {
      const result = await options.client.callTool(
        'get_control_snapshot',
        selection(),
        { signal: controller.signal },
      );
      if (stopped || currentGeneration !== generation) return;
      accept(result);
      connected();
      void wait(currentGeneration);
    } catch (error) {
      if (!stopped && currentGeneration === generation) {
        options.onPhase(lastResult ? 'offline' : 'error', message(error));
      }
    } finally {
      if (pending === controller) pending = undefined;
    }
  };

  return Object.freeze({
    start: load,
    async select(agentId: string) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(agentId)) {
        throw new Error('VISIBILITY_AGENT_ID_INVALID');
      }
      selectedAgentId = agentId;
      await load();
    },
    async collapse() {
      selectedAgentId = undefined;
      await load();
    },
    retry: load,
    stop() {
      stopped = true;
      generation += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      pending?.abort();
    },
  });
}
