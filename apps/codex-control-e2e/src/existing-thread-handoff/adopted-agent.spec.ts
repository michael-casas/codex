import { expect, test } from '@playwright/test';

import { installControlFixture } from '../cas-10/control.fixture.js';

// === L2: END-TO-END TESTS ===
test('[L2:E2E] CAS-ETH-L2-003 shows adopted ownership in summary and selected feed without duplicate waits', async ({ page }) => {
  await installControlFixture(page, 'adopted');
  await page.goto('/agents/agent-ada');
  await expect(page.getByRole('heading', { name: 'Ada', level: 1 })).toBeVisible();
  await expect(page.getByText('Adopted', { exact: true })).toBeVisible();
  await expect(page.getByText('Reviewed feeder schedule')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open mobile view' })).toHaveAttribute(
    'href',
    'https://control.example.ts.net/agents/agent-ada',
  );
  await page.getByRole('button', { name: 'Close agent feed' }).click();
  await expect(page.getByText('Select an agent to view its live feed.')).toBeVisible();
  const state = await page.evaluate(() => (
    globalThis as unknown as { __CAS10_FIXTURE__: { state(): unknown } }
  ).__CAS10_FIXTURE__.state());
  expect(state).toMatchObject({ activeWaits: 1, maxActiveWaits: 1 });
});
