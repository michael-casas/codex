import { expect, test } from '@playwright/test';

test('R2-TOOL-DISCLOSURE opens a capped nested scrollview below an anchored Tool Call trigger', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const output = Array.from(
      { length: 80 },
      (_, index) => `Output line ${index}`,
    ).join('\n');
    Object.assign(globalThis, {
      __CODEX_CONTROL__: {
        async callTool(
          name: string,
          args: { selectedAgentId?: string },
          options?: { signal?: AbortSignal },
        ) {
          if (name !== 'get_control_snapshot')
            return new Promise((_resolve, reject) =>
              options?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              ),
            );
          return {
            cursor: '4',
            changed: true,
            workflows: [
              {
                id: 'tool-demo',
                label: 'Tool disclosure',
                status: 'completed',
                stateText: 'Completed',
                steps: [
                  {
                    id: 'build',
                    label: 'Build',
                    agents: [
                      {
                        id: 'builder',
                        label: 'Builder',
                        status: 'completed',
                        stateText: 'Completed',
                      },
                    ],
                  },
                ],
              },
            ],
            details: args.selectedAgentId
              ? {
                  agentId: 'builder',
                  truncated: false,
                  events: [],
                  items: [
                    {
                      id: 'item:tool',
                      agentId: 'builder',
                      itemId: 'tool',
                      threadId: 'thread-a',
                      turnId: 'turn-a',
                      itemType: 'commandExecution',
                      kind: 'tool',
                      state: 'completed',
                      body: output,
                      revision: '4',
                      firstRevision: '3',
                      firstSeenAt: '2026-09-04T12:00:00Z',
                      updatedAt: '2026-09-04T12:00:01Z',
                      messagePhase: null,
                      truncated: false,
                      originalBytes: output.length,
                      evaluation: true,
                    },
                  ],
                }
              : undefined,
          };
        },
      },
    });
  });
  await page.goto('/workflows/tool-demo');
  await page.getByRole('button', { name: /Builder/ }).click();
  const feed = page.getByRole('complementary', { name: 'Builder' });
  const trigger = feed.locator('.tool-item summary');
  await expect(trigger).toHaveAccessibleName('Tool Call completed');
  await expect(trigger.locator('svg[data-icon="tool-call"]')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  const before = await trigger.boundingBox();
  await trigger.click();
  const after = await trigger.boundingBox();
  const output = feed.getByLabel('Tool output');
  await expect(output).toBeVisible();
  expect(
    Math.abs((after?.y ?? Infinity) - (before?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
  const geometry = await output.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
    top: element.getBoundingClientRect().top,
  }));
  expect(geometry.top).toBeGreaterThanOrEqual(
    (after?.y ?? Infinity) + (after?.height ?? 0),
  );
  expect(geometry.clientHeight).toBeLessThanOrEqual(192);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.overflowY).toBe('auto');
});
