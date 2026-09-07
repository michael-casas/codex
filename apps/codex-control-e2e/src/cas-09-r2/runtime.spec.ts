import { expect, test } from '@playwright/test';

const workflow = {
  id: 'workflow-live',
  label: 'Live workflow',
  status: 'running',
  stateText: 'Research is in progress',
  progressLabel: '0/1 agents completed',
  steps: [
    {
      id: 'research',
      label: 'Research',
      progressLabel: '0/1 agents completed',
      agents: [
        {
          id: 'agent-live',
          label: 'Live agent',
          status: 'running',
          stateText: 'Inspecting production composition',
        },
      ],
    },
  ],
};

test.describe('@cas09r2-l2 same-origin production client', () => {
  test('loads summary without an injected window bridge', async ({ page }) => {
    await page.route('**/api/control/snapshot**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cursor: '1',
          changed: true,
          workflows: [workflow],
        }),
      });
    });
    await page.route(
      '**/api/control/wait**',
      async () => await new Promise(() => undefined),
    );

    await page.goto('/workflows/workflow-live');
    await expect(
      page.getByRole('heading', { name: 'Live workflow' }),
    ).toBeVisible();
  });

  test('requests detail only after selecting an agent', async ({ page }) => {
    const selections: string[] = [];
    await page.route('**/api/control/snapshot**', async (route) => {
      const selected = new URL(route.request().url()).searchParams.get(
        'selectedAgentId',
      );
      if (selected) selections.push(selected);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cursor: '1',
          changed: true,
          workflows: [workflow],
          ...(selected
            ? {
                details: {
                  agentId: selected,
                  truncated: false,
                  events: [],
                },
              }
            : {}),
        }),
      });
    });
    await page.route(
      '**/api/control/wait**',
      async () => await new Promise(() => undefined),
    );

    await page.goto('/workflows/workflow-live');
    await expect(
      page.getByRole('button', { name: /Live agent/ }),
    ).toBeVisible();
    expect(selections).toEqual([]);
    await page.getByRole('button', { name: /Live agent/ }).click();
    await expect.poll(() => selections).toEqual(['agent-live']);
  });
});
