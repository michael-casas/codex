import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from '@playwright/test';
import {
  cleanupReadable,
  readableBindings,
  type ReadableState,
} from './readable-visibility.steps.js';

const workspace = resolve(import.meta.dirname, '../../../..');
const source = resolve(
  workspace,
  'apps/codex-control-e2e/features/cas-ui-r2/readable-visibility.feature',
);
const require = createRequire(import.meta.url);
const { getPicklesAndErrors } = require('@cucumber/cucumber/lib/api/gherkin');
let sequence = 0;
const parsed = await getPicklesAndErrors({
  newId: () => String(++sequence),
  cwd: workspace,
  sourcePaths: [source],
  coordinates: {
    defaultDialect: 'en',
    paths: [source],
    names: [],
    tagExpression: '@web',
    order: 'defined',
  },
});
if (parsed.parseErrors.length || parsed.filterablePickles.length !== 4)
  throw Error('READABLE_FEATURE_INVALID');
for (const { pickle } of parsed.filterablePickles) {
  const ids = pickle.tags
    .map((tag: { name: string }) => tag.name)
    .filter((name: string) => name.startsWith('@BATDD-R2-'));
  if (ids.length !== 1) throw Error('READABLE_SCENARIO_ID_INVALID');
  test('@cas-ui-r2 ' + ids[0] + ' ' + pickle.name, async ({ page }, info) => {
    test.setTimeout(90_000);
    const state: ReadableState = { trackedRequests: [] };
    try {
      for (const step of pickle.steps) {
        const binding = readableBindings[step.text];
        if (!binding) throw Error('READABLE_BINDING_MISSING:' + step.text);
        await test.step(step.text, () => binding(page, state));
      }
    } finally {
      await cleanupReadable(state, info);
    }
  });
}
