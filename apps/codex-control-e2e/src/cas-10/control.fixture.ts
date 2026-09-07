import type { Page } from '@playwright/test';

export async function installControlFixture(
  page: Page,
  mode: 'ready' | 'empty' | 'error' | 'reconnect' = 'ready',
) {
  await page.addInitScript(
    ({ fixtureMode }) => {
      const workflow = {
        id: 'estimate-research',
        label: 'Estimate research',
        status: 'running',
        stateText: 'Research is in progress',
        progressLabel: '2/6 agents completed',
        steps: [
          {
            id: 'research',
            label: 'Research',
            progressLabel: '2/3 agents completed',
            agents: [
              {
                id: 'agent-ada',
                label: 'Ada',
                status: 'running',
                stateText: 'Reviewing feeder schedules',
              },
              {
                id: 'agent-grace',
                label: 'Grace',
                status: 'completed',
                stateText: 'Compared panel alternates',
              },
              {
                id: 'agent-katherine',
                label: 'Katherine',
                status: 'completed',
                stateText: 'Validated labor assumptions',
              },
            ],
          },
          {
            id: 'implementation',
            label: 'Implementation',
            progressLabel: '0/3 agents completed · Not started',
            agents: [],
          },
        ],
      };
      const calls: Array<{
        name: string;
        selectedAgentId?: string;
        aborted: boolean;
      }> = [];
      let activeWaits = 0;
      let maxActiveWaits = 0;
      let waitAttempts = 0;

      const result = (selectedAgentId?: string) => ({
        cursor: '7',
        changed: true,
        workflows: fixtureMode === 'empty' ? [] : [workflow],
        details: selectedAgentId
          ? {
              agentId: selectedAgentId,
              truncated: false,
              events: [
                {
                  eventId: `${selectedAgentId}-event`,
                  occurredAt: '2026-09-02T12:00:00Z',
                  detail: {
                    type: 'message',
                    body:
                      selectedAgentId === 'agent-ada'
                        ? 'Reviewed feeder schedule'
                        : 'Compared panel alternates',
                    truncated: false,
                  },
                },
              ],
            }
          : undefined,
        decisions: [
          { id: 'decision-1', label: 'Awaiting scope approval', state: 'open' },
        ],
        artifacts: [
          { id: 'artifact-1', label: 'Research summary', href: '#artifact-1' },
        ],
      });

      Object.assign(globalThis, {
        __CODEX_CONTROL_MOBILE_BASE_URL__: 'https://control.example.ts.net',
        __CODEX_CONTROL_MOBILE_ACCESS__: 'tailnet',
        __CODEX_CONTROL__: {
          async callTool(
            name: string,
            args: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) {
            const call = {
              name,
              selectedAgentId:
                typeof args['selectedAgentId'] === 'string'
                  ? args['selectedAgentId']
                  : undefined,
              aborted: false,
            };
            calls.push(call);
            if (fixtureMode === 'error' && name === 'get_control_snapshot') {
              throw new Error('Control gateway unavailable');
            }
            if (name === 'get_control_snapshot') {
              return result(call.selectedAgentId);
            }
            waitAttempts += 1;
            if (fixtureMode === 'reconnect' && waitAttempts === 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              throw new Error('Connection interrupted');
            }
            if (fixtureMode === 'reconnect' && waitAttempts === 2) {
              return {
                ...result(call.selectedAgentId),
                cursor: '8',
                workflows: [
                  {
                    ...workflow,
                    stateText: 'Reconnected to control plane',
                  },
                ],
              };
            }
            activeWaits += 1;
            maxActiveWaits = Math.max(maxActiveWaits, activeWaits);
            return await new Promise((resolve, reject) => {
              options?.signal?.addEventListener(
                'abort',
                () => {
                  call.aborted = true;
                  activeWaits -= 1;
                  reject(new DOMException('Aborted', 'AbortError'));
                },
                { once: true },
              );
            });
          },
        },
        __CAS10_FIXTURE__: {
          calls,
          state: () => ({ activeWaits, maxActiveWaits, waitAttempts }),
        },
      });
    },
    { fixtureMode: mode },
  );
}
