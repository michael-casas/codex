import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

import { installControlFixture } from './control.fixture.js';

const featureUrl = new URL(
  '../../features/cas-10/workflow-visibility.feature',
  import.meta.url,
);
const require = createRequire(import.meta.url);
type ParsedPickle = {
  readonly name: string;
  readonly tags: readonly { readonly name: string }[];
  readonly steps: readonly { readonly text: string }[];
};
const { getPicklesAndErrors } =
  require('@cucumber/cucumber/lib/api/gherkin') as {
    getPicklesAndErrors(options: {
      newId: () => string;
      cwd: string;
      sourcePaths: string[];
      coordinates: {
        defaultDialect: string;
        paths: string[];
        names: string[];
        tagExpression: string;
        order: 'defined';
      };
    }): Promise<{
      filterablePickles: readonly { readonly pickle: ParsedPickle }[];
      parseErrors: readonly unknown[];
    }>;
  };
let sequence = 0;
const { filterablePickles, parseErrors } = await getPicklesAndErrors({
  newId: () => String((sequence += 1)),
  cwd: process.cwd(),
  sourcePaths: [featureUrl.pathname],
  coordinates: {
    defaultDialect: 'en',
    paths: [featureUrl.pathname],
    names: [],
    tagExpression: '@web and @BATDD-CAS-10-001',
    order: 'defined',
  },
});
const pickles = filterablePickles.map(({ pickle }) => pickle);

type Binding = (page: Page) => Promise<void>;
const bindings: Record<string, Binding> = {
  'the estimating workflow has two of three research agents complete': async (
    page,
  ) => installControlFixture(page),
  'the operator opens the workflow visibility route': async (page) => {
    await page.goto('/workflows/estimate-research');
  },
  'research progress and the waiting implementation step are visible': async (
    page,
  ) => {
    await expect(page.getByText('2/3 agents completed')).toBeVisible({
      timeout: 2_000,
    });
    await expect(
      page.getByText('0/3 agents completed · Not started'),
    ).toBeVisible({ timeout: 2_000 });
  },
  'the operator selects Ada': async (page) => {
    await page.getByRole('button', { name: /Ada/ }).click({ timeout: 2_000 });
  },
  "only Ada's current feed is visible": async (page) => {
    const feed = page.getByRole('complementary', { name: 'Ada' });
    await expect(
      feed.getByText('Reviewed feeder schedule', { exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    await expect(
      feed.getByText('Compared panel alternates', { exact: true }),
    ).toHaveCount(0, { timeout: 2_000 });
  },
  'the operator collapses the selected feed': async (page) => {
    await page
      .getByRole('button', { name: 'Close agent feed' })
      .click({ timeout: 2_000 });
  },
  'no agent detail feed remains visible': async (page) => {
    await expect(
      page.getByText('Select an agent to view its live feed.'),
    ).toBeVisible({ timeout: 2_000 });
  },
};

if (parseErrors.length > 0) throw new Error('CAS-10 Gherkin parse failed.');
if (pickles.length !== 1)
  throw new Error('CAS-10 must select exactly one scenario.');

// === L2: END-TO-END TESTS ===
for (const pickle of pickles) {
  test(`[L2:E2E] @cas10-l3 ${pickle.name}`, async ({ page }) => {
    expect(pickle.tags.map(({ name }) => name)).toContain('@BATDD-CAS-10-001');
    for (const step of pickle.steps) {
      const binding = bindings[step.text];
      expect(binding, `Missing binding for: ${step.text}`).toBeDefined();
      await binding(page);
    }
  });
}
