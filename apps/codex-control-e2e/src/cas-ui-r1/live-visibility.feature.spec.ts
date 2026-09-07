import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const workspace = resolve(import.meta.dirname, '../../../..');
const feature = resolve(
  workspace,
  'apps/codex-control-e2e/features/cas-ui-r1/live-visibility.feature',
);
const require = createRequire(import.meta.url);
const { getPicklesAndErrors } = require('@cucumber/cucumber/lib/api/gherkin');
let sequence = 0;
const parsed = await getPicklesAndErrors({
  newId: () => String(++sequence),
  cwd: workspace,
  sourcePaths: [feature],
  coordinates: {
    defaultDialect: 'en',
    paths: [feature],
    names: [],
    tagExpression: '@web',
    order: 'defined',
  },
});
if (parsed.parseErrors.length || parsed.filterablePickles.length !== 3)
  throw Error('UIR1_FEATURE_INVALID');

type State = {
  child?: ChildProcess;
  exit?: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  fixtureRoot?: string;
  databaseName?: string;
  diagnostic?: string;
  origin?: string;
  controlOrigin?: string;
  runId?: string;
  agentId?: string;
};
async function start(state: State, direct = false) {
  const child = spawn(
    'bun',
    [
      resolve(
        workspace,
        'apps/daemon/src/visibility/support/visibility-runtime.fixture.mjs',
      ),
      ...(direct ? ['--delegation'] : []),
    ],
    { cwd: workspace, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  state.child = child;
  state.exit = new Promise((resolveExit) =>
    child.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  let diagnostic = '';
  child.stderr?.on('data', (data) => {
    diagnostic = (diagnostic + String(data)).slice(-2000);
    state.diagnostic = diagnostic
      .replace(
        /\b(token|password|secret|credential)\s*[:=]\s*\S+/gi,
        '$1=[redacted]',
      )
      .replace(
        /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi,
        '[credential]@',
      );
  });
  if (!child.stdout) throw Error('FIXTURE_STDOUT_MISSING');
  const lines = createInterface({ input: child.stdout });
  const ready = await new Promise<{
    origin: string;
    controlOrigin: string;
    runId: string;
  }>((resolveReady, reject) => {
    const timer = setTimeout(
      () => reject(Error('FIXTURE_START_TIMEOUT ' + diagnostic)),
      20_000,
    );
    lines.on('line', (line) => {
      try {
        const value = JSON.parse(line);
        if (value.origin && value.controlOrigin) {
          clearTimeout(timer);
          resolveReady(value);
        }
      } catch {
        /* Non-JSON runtime diagnostic is not a ready signal. */
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(Error('FIXTURE_EXIT ' + diagnostic));
    });
  });
  Object.assign(state, ready);
  try {
    await expect
      .poll(async () => {
        const response = await fetch(state.controlOrigin + '/status');
        return ((await response.json()) as { count: number }).count;
      })
      .toBe(direct ? 1 : 2);
  } catch (error) {
    const stateResponse = await fetch(state.controlOrigin + '/status');
    throw new Error(
      String(error) + ' ' + diagnostic + ' ' + (await stateResponse.text()),
    );
  }
}
async function action(state: State, path: string) {
  const response = await fetch(state.controlOrigin + path, { method: 'POST' });
  expect(response.ok).toBe(true);
  return response.json() as Promise<{ origin: string }>;
}
const bindings: Record<string, (page: Page, state: State) => Promise<void>> = {
  'a production runtime launches a synthetic direct handoff': async (
    _page,
    state,
  ) => start(state, true),
  'the operator opens the direct agent view': async (page, state) => {
    await page.goto(state.origin + '/agents/' + state.agentId);
  },
  'the direct agent and its live feed are visible': async (page) => {
    await expect(
      page.getByRole('button', { name: /Synthetic-A/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText(/Agent A live/),
    ).toBeVisible();
  },
  'the direct agent finishes and the runtime restarts': async (page, state) => {
    await action(state, '/complete-a');
    await expect(
      page.getByRole('button', { name: /Synthetic-A/ }),
    ).toContainText('completed');
    state.origin = (await action(state, '/restart')).origin;
    await page.goto(state.origin + '/agents/' + state.agentId);
  },
  'the completed direct agent and captured feed remain visible': async (
    page,
  ) => {
    await expect(page.getByRole('button', { name: /Synthetic-A/ })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole('button', { name: /Synthetic-A/ }),
    ).toContainText('completed');
    await expect(
      page.getByRole('complementary').getByText(/Agent A final/),
    ).toBeVisible();
  },
  'a production runtime executes two synthetic App Server agents': async (
    _page,
    state,
  ) => start(state),
  'the operator opens the workflow view': async (page, state) => {
    await page.goto(state.origin + '/workflows/' + state.runId);
  },
  'the Research phase displays both running agents': async (page) => {
    await expect(page.getByRole('button', { name: /Agent A/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Agent B/ })).toBeVisible();
    await expect(
      page.getByText('0/2 agents completed', { exact: true }).first(),
    ).toBeVisible();
  },
  'the operator selects Agent A': async (page) => {
    await page.getByRole('button', { name: /Agent A/ }).click();
  },
  'only Agent A live feed is visible': async (page) => {
    const feed = page.getByRole('complementary');
    await expect(feed.getByText(/Agent A live/)).toBeVisible();
    await expect(feed.getByText(/Agent B live/)).toHaveCount(0);
  },
  'Agent A finishes': async (_page, state) => {
    await action(state, '/complete-a');
  },
  'Agent B remains visible and progress advances': async (page) => {
    await expect(page.getByRole('button', { name: /Agent B/ })).toBeVisible();
    await expect(
      page.getByText('1/2 agents completed', { exact: true }).first(),
    ).toBeVisible();
  },
  'the remaining workflow finishes and the runtime restarts': async (
    page,
    state,
  ) => {
    await action(state, '/complete-b');
    await expect(
      page.getByText('3/3 agents completed', { exact: true }).first(),
    ).toBeVisible();
    state.origin = (await action(state, '/restart')).origin;
    await page.goto(state.origin + '/workflows/' + state.runId);
  },
  'the completed workflow remains visible without duplicate agents': async (
    page,
  ) => {
    await expect(
      page.getByText('3/3 agents completed', { exact: true }).first(),
    ).toBeVisible();
    for (const name of ['Agent A', 'Agent B', 'Agent C'])
      await expect(
        page.getByRole('button', { name: new RegExp(name) }),
      ).toHaveCount(1);
  },
  'the browser loses runtime connectivity': async (page, state) => {
    await page.route('**/api/control/**', (route) => route.abort());
    await action(state, '/complete-a');
  },
  'the last-known workflow remains visibly stale and offline': async (page) => {
    await expect(page.getByText('Offline', { exact: true })).toBeVisible({
      timeout: 6000,
    });
    await expect(page.getByText(/last.known/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Agent B/ })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'No Workflows Running' }),
    ).toHaveCount(0);
  },
};
for (const { pickle } of parsed.filterablePickles) {
  test('@cas-ui-r1 ' + pickle.name, async ({ page }) => {
    test.setTimeout(60_000);
    const state: State = {};
    try {
      for (const step of pickle.steps) {
        const binding = bindings[step.text];
        if (!binding) throw Error('MISSING_BINDING ' + step.text);
        await binding(page, state);
      }
    } finally {
      if (state.child && state.child.exitCode === null)
        state.child.kill('SIGTERM');
      const exit = await state.exit;
      expect(exit, state.diagnostic).toEqual({ code: 0, signal: null });
      expect(state.fixtureRoot).toBeTruthy();
      expect(existsSync(state.fixtureRoot ?? '')).toBe(false);
    }
  });
}
