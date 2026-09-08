import { expect, test, type Page } from '@playwright/test';
import { installControlFixture } from '../cas-10/control.fixture.js';

async function installRecoveredFixture(page: Page) {
  await page.addInitScript(() => {
    Object.assign(globalThis, {
      __CODEX_CONTROL__: {
        async callTool(
          name: string,
          args: { selectedAgentId?: string },
          options?: { signal?: AbortSignal },
        ) {
          if (name !== 'get_control_snapshot') {
            return new Promise((_resolve, reject) =>
              options?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              ),
            );
          }
          return {
            cursor: '9',
            changed: true,
            workflows: [
              {
                id: 'recovered',
                label: 'Recovered workflow',
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
                  events: [
                    {
                      eventId: 'unavailable',
                      kind: 'result.unavailable',
                      occurredAt: '2026-09-04T12:00:00Z',
                      detail: {
                        type: 'message',
                        body: 'Validated result display unavailable: item provenance could not be verified.',
                        truncated: false,
                      },
                    },
                  ],
                  items: [
                    {
                      id: 'item:existing',
                      agentId: 'builder',
                      itemId: 'existing',
                      threadId: 'thread-a',
                      turnId: 'turn-a',
                      itemType: 'agentMessage',
                      kind: 'message',
                      state: 'completed',
                      body: 'Existing safe activity',
                      revision: '8',
                      firstRevision: '8',
                      firstSeenAt: '2026-09-04T11:59:00Z',
                      updatedAt: '2026-09-04T11:59:00Z',
                      messagePhase: 'commentary',
                      truncated: false,
                      originalBytes: 22,
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
}

// === L2: END-TO-END TESTS ===
test('[L2:E2E] R2-RECOVERY shows unavailable display beside an existing typed message without inventing a result', async ({
  page,
}) => {
  await installRecoveredFixture(page);
  await page.goto('/workflows/recovered');
  await page.getByRole('button', { name: /Builder/ }).click();
  const feed = page.getByRole('complementary', { name: 'Builder' });
  await expect(feed.getByText('Existing safe activity')).toBeVisible();
  await expect(feed.getByRole('status')).toHaveText(
    'Validated result display unavailable: item provenance could not be verified.',
    { timeout: 2000 },
  );
  await expect(feed.locator('[data-kind="result"], dl')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Builder/ })).toContainText(
    'Completed',
  );
});

test('[L2:E2E] R2-PRESENTATION hides timestamps in a typed feed while preserving message content', async ({
  page,
}) => {
  await installRecoveredFixture(page);
  await page.goto('/workflows/recovered');
  await page.getByRole('button', { name: /Builder/ }).click();
  const feed = page.getByRole('complementary', { name: 'Builder' });
  await expect(feed.getByText('Existing safe activity')).toBeVisible();
  await expect(feed.locator('time')).toHaveCount(0, { timeout: 2000 });
});

test('[L2:E2E] R2-PRESENTATION hides timestamps in legacy fallback without inventing message identity', async ({
  page,
}) => {
  await installControlFixture(page);
  await page.goto('/agents/agent-ada');
  const feed = page.getByRole('complementary', { name: 'Ada' });
  await expect(feed.getByText('Reviewed feeder schedule')).toBeVisible();
  await expect(
    feed.getByText(
      'Legacy activity — message identity and completeness are unavailable.',
    ),
  ).toBeVisible();
  await expect(feed.locator('time')).toHaveCount(0, { timeout: 2000 });
});
