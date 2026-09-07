import { expect, test } from '@playwright/test';

import { installControlFixture } from './control.fixture.js';

test.describe('@cas10-l2 rendered visibility', () => {
  test.beforeEach(async ({ page }) => {
    await installControlFixture(page);
  });

  test('renders workflow progress, decisions, artifacts, and safe links', async ({
    page,
  }) => {
    await page.goto('/workflows/estimate-research');
    await expect(
      page.getByRole('heading', { name: 'Estimate research' }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText('2/3 agents completed')).toBeVisible({
      timeout: 2_000,
    });
    await expect(
      page.getByText('0/3 agents completed · Not started'),
    ).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText('Awaiting scope approval')).toBeVisible({
      timeout: 2_000,
    });
    await expect(
      page.getByRole('link', { name: 'Research summary' }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(
      page.getByRole('link', { name: 'Open mobile view' }),
    ).toHaveAttribute(
      'href',
      'https://control.example.ts.net/workflows/estimate-research',
      { timeout: 2_000 },
    );
  });

  test('transfers detail only for the selected agent and cancels on collapse', async ({
    page,
  }) => {
    await page.goto('/workflows/estimate-research');
    await page.getByRole('button', { name: /Ada/ }).click({ timeout: 2_000 });
    await expect(page.getByText('Reviewed feeder schedule')).toBeVisible({
      timeout: 2_000,
    });
    await page.getByRole('button', { name: /Grace/ }).click({ timeout: 2_000 });
    const feed = page.getByRole('complementary', { name: 'Grace' });
    await expect(
      feed.getByText('Compared panel alternates', { exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(
      feed.getByText('Reviewed feeder schedule', { exact: true }),
    ).toHaveCount(0, { timeout: 2_000 });
    await page
      .getByRole('button', { name: 'Close agent feed' })
      .click({ timeout: 2_000 });
    await expect(
      page.getByText('Select an agent to view its live feed.'),
    ).toBeVisible({ timeout: 2_000 });
    const state = await page.evaluate(() =>
      (
        globalThis as unknown as { __CAS10_FIXTURE__: { state(): unknown } }
      ).__CAS10_FIXTURE__.state(),
    );
    expect(state).toMatchObject({ activeWaits: 1, maxActiveWaits: 1 });
  });

  test('renders direct agent, empty, and bounded error states', async ({
    page,
  }) => {
    await page.goto('/agents/agent-ada');
    await expect(
      page.getByRole('heading', { name: 'Ada', level: 1 }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText('Reviewed feeder schedule')).toBeVisible({
      timeout: 2_000,
    });

    await page.close();
  });
});

test('@cas10-l2 renders an empty state', async ({ page }) => {
  await installControlFixture(page, 'empty');
  await page.goto('/workflows/estimate-research');
  await expect(page.getByText('No Workflows Running')).toBeVisible({
    timeout: 2_000,
  });
});

test('@cas10-l2 renders a bounded gateway error', async ({ page }) => {
  await installControlFixture(page, 'error');
  await page.goto('/workflows/estimate-research');
  await expect(page.getByRole('alert')).toContainText(
    'Control gateway unavailable',
    { timeout: 2_000 },
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({
    timeout: 2_000,
  });
});

test('@cas10-l2 reconnects one interrupted summary wait', async ({ page }) => {
  await installControlFixture(page, 'reconnect');
  await page.goto('/workflows/estimate-research');
  await expect(page.getByText(/reconnecting/i)).toBeVisible({
    timeout: 2_000,
  });
  await expect(page.getByText('Reconnected to control plane')).toBeVisible({
    timeout: 2_000,
  });
  const state = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __CAS10_FIXTURE__: { state(): { waitAttempts: number } };
      }
    ).__CAS10_FIXTURE__.state(),
  );
  expect(state.waitAttempts).toBeGreaterThanOrEqual(3);
});
