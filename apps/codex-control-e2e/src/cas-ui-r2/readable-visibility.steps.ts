import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, type Page, type TestInfo } from '@playwright/test';

const workspace = resolve(import.meta.dirname, '../../../..');
const authorization = 'Bearer ' + 's'.repeat(64);
export interface ReadableState {
  child?: ChildProcess;
  exit?: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  fixtureRoot?: string;
  databaseName?: string;
  origin?: string;
  controlOrigin?: string;
  runId?: string;
  title?: string;
  cleanup?: string;
  trackedRequests: string[];
  scrollAnchor?: { itemId: string; top: number };
}
async function request(state: ReadableState, path: string, method = 'POST') {
  const response = await fetch(state.controlOrigin + path, {
    method,
    headers: { authorization },
  });
  expect(response.ok, 'fixture control ' + path).toBe(true);
  return response.json() as Promise<{
    count?: number;
    workflow?: { state: string };
    state?: string;
  }>;
}
async function start(state: ReadableState) {
  const child = spawn(
    'bun',
    [
      resolve(
        workspace,
        'apps/daemon/src/visibility/support/readable-visibility-runtime.fixture.mjs',
      ),
    ],
    { cwd: workspace, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  state.child = child;
  state.exit = new Promise((resolveExit) =>
    child.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  if (!child.stdout) throw Error('READABLE_STDOUT_MISSING');
  let diagnostic = '';
  child.stderr?.on('data', (chunk) => {
    diagnostic = (diagnostic + String(chunk)).slice(-1200);
  });
  const lines = createInterface({ input: child.stdout });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(
      () => reject(Error('READABLE_START_TIMEOUT')),
      25_000,
    );
    lines.on('line', (line) => {
      try {
        const value = JSON.parse(line);
        if (value.fixtureRoot) state.fixtureRoot = value.fixtureRoot;
        if (value.databaseName) state.databaseName = value.databaseName;
        if (value.cleanup) state.cleanup = value.cleanup;
        if (value.origin && value.controlOrigin) {
          Object.assign(state, value);
          clearTimeout(timer);
          resolveReady();
        }
      } catch {
        /* Runtime output is not a readiness signal unless it is JSON. */
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(
        Error(
          'READABLE_FIXTURE_EXIT ' +
            diagnostic.replace(
              /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi,
              '[redacted]@',
            ),
        ),
      );
    });
  });
  await expect
    .poll(async () => (await request(state, '/status', 'GET')).count, {
      timeout: 15_000,
    })
    .toBe(2);
}
export async function cleanupReadable(state: ReadableState, info: TestInfo) {
  if (state.child?.exitCode === null) state.child.stdin?.end('stop\n');
  const exit = await state.exit;
  const evidence = {
    child: exit,
    fixtureRoot: state.fixtureRoot,
    databaseName: state.databaseName,
    rootRemoved: Boolean(state.fixtureRoot && !existsSync(state.fixtureRoot)),
    cleanup: state.cleanup,
  };
  await info.attach('owned-fixture-cleanup', {
    body: Buffer.from(JSON.stringify(evidence)),
    contentType: 'application/json',
  });
  expect(exit, 'owned runtime exits cleanly').toEqual({
    code: 0,
    signal: null,
  });
  expect(state.cleanup, 'owned host, database and runtime report cleanup').toBe(
    'complete',
  );
  expect(state.fixtureRoot, 'exact owned root was reported').toBeTruthy();
  expect(evidence.rootRemoved, 'exact owned temporary root removed').toBe(true);
}
const feed = (page: Page) =>
  page.getByRole('region', { name: 'Agent messages', exact: true });
const article = (page: Page, id: string) =>
  feed(page).locator(`article[data-item-id="${id}"]`);
async function openWriter(page: Page, state: ReadableState) {
  await page.goto(state.origin + '/workflows/' + state.runId);
  await page.getByRole('button', { name: /Writer/ }).click();
}
async function assertReadableTitle(page: Page, state: ReadableState) {
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(state.title ?? '');
  await expect.poll(() => page.title()).toContain(state.title);
  const dimensions = await heading.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
}
async function assertSafeMessage(page: Page, state: ReadableState) {
  const message = article(page, 'writer-message');
  await expect(message).toHaveCount(1);
  await expect(message.locator('strong')).toHaveText('Final update');
  await expect(message.locator('code')).toHaveText('safeCode');
  await expect(message).not.toContainText('small chunk');
  await expect(
    feed(page).locator('script, iframe, object, img, a[href^="javascript:"]'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, '__r2Unsafe')),
  ).toBeUndefined();
  expect(state.trackedRequests).toHaveLength(0);
}
async function assertBoundedFeed(page: Page) {
  const dimensions = await feed(page).evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    viewport: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(dimensions.height).toBeGreaterThan(0);
  expect(dimensions.height).toBeLessThan(dimensions.viewport);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width + 1);
  await expect(
    page.getByRole('button', { name: 'Close agent feed', exact: true }),
  ).toBeInViewport();
  await expect(
    page
      .getByRole('complementary')
      .getByRole('heading', { name: 'Writer', exact: true }),
  ).toBeInViewport();
}
async function assertReaderPosition(page: Page, state: ReadableState) {
  await expect(
    page.getByRole('button', { name: /jump to latest/i }),
  ).toBeVisible();
  const top = await article(page, state.scrollAnchor?.itemId ?? '').evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(
    Math.abs(top - (state.scrollAnchor?.top ?? Infinity)),
  ).toBeLessThanOrEqual(2);
}
async function assertReducedMotion(page: Page) {
  await expect(article(page, 'new-content')).toBeInViewport();
  const animations = await article(page, 'new-content').evaluate(
    (element) =>
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
  );
  expect(animations).toBe(0);
}
export const readableBindings: Record<
  string,
  (page: Page, state: ReadableState) => Promise<void>
> = {
  'a source workflow with a long human title runs a writer and companion':
    async (_page, state) => start(state),
  'the operator opens its workflow view': async (page, state) => {
    await page.goto(state.origin + '/workflows/' + state.runId);
  },
  'the human title appears in the heading and browser tab without overflowing':
    assertReadableTitle,
  'no source signature is presented as the heading': async (page) => {
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(
      /source\.[a-f0-9]{64}/,
    );
  },
  'the operator opens the writer feed': openWriter,
  'many writer deltas form one stable message': async (page) => {
    await expect(article(page, 'writer-message')).toHaveCount(1);
    await expect(article(page, 'writer-message')).toHaveAttribute(
      'data-kind',
      'message',
    );
    await expect(article(page, 'writer-message')).toContainText(
      'Draft update:',
    );
    await expect(
      feed(page).locator('article[data-kind="message"]'),
    ).toHaveCount(1);
  },
  'the writer corrects and completes that message with Markdown and hostile content':
    async (page, state) => {
      page.on('request', (incoming) => {
        if (incoming.url().includes('example.invalid/r2-tracker'))
          state.trackedRequests.push(incoming.url());
      });
      await request(state, '/finalize-message');
    },
  'its existing message is replaced with safe strong and code formatting':
    assertSafeMessage,
  'one compact completed tool is visible without raw parameters': async (
    page,
  ) => {
    const tool = article(page, 'writer-command');
    await expect(tool).toHaveCount(1);
    await expect(tool).toHaveAttribute('data-kind', 'tool');
    await expect(tool).toContainText(/completed/i);
    await expect(tool).not.toContainText('"commandActions"');
  },
  'the writer returns a schema-validated ready result': async (
    _page,
    state,
  ) => {
    await request(state, '/complete-writer');
  },
  'labeled result fields appear without raw JSON while the companion keeps the workflow running':
    async (page, state) => {
      const result = article(page, 'writer-result');
      await expect(result).toHaveAttribute('data-kind', 'result');
      await expect(result).toContainText('Synthetic launch');
      await expect(result).toContainText('ready');
      await expect(result).toContainText('Checks passed');
      await expect(result.locator('dt')).toContainText([
        'title',
        'status',
        'notes',
        'count',
        'enabled',
      ]);
      await expect(result.locator('dd').filter({ hasText: /^0$/ })).toHaveCount(
        1,
      );
      await expect(
        result.locator('dd').filter({ hasText: /^false$/ }),
      ).toHaveCount(1);
      await expect(result).not.toContainText('{"title"');
      await expect(
        page.getByRole('button', { name: /Companion/ }),
      ).toContainText('running');
      expect((await request(state, '/status', 'GET')).workflow?.state).toBe(
        'running',
      );
    },
  'the operator prefers reduced motion': async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  },
  'the operator opens a long writer feed and scrolls to older activity': async (
    page,
    state,
  ) => {
    await openWriter(page, state);
    await request(state, '/long-feed');
    await expect(article(page, 'history-0')).toBeAttached();
    await expect(article(page, 'wide-code')).toBeAttached();
    await feed(page).evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    state.scrollAnchor = await article(page, 'history-0').evaluate(
      (element) => ({
        itemId: element.getAttribute('data-item-id') ?? '',
        top: element.getBoundingClientRect().top,
      }),
    );
  },
  'the feed is internally scrollable with its header and close control visible':
    assertBoundedFeed,
  'new writer activity arrives': async (_page, state) => {
    await request(state, '/append-feed');
  },
  'the reader position is preserved and jump to latest is available':
    assertReaderPosition,
  'the operator jumps to the latest activity': async (page) => {
    await page.getByRole('button', { name: /jump to latest/i }).click();
  },
  'the newest activity is visible without text reveal animation':
    assertReducedMotion,
  'provider status becomes unknown': async (_page, state) => {
    await request(state, '/unknown');
  },
  'the workflow and companion remain in the current view': async (page) => {
    await expect(page.getByRole('button', { name: /Writer/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Companion/ })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'No Workflows Running', exact: true }),
    ).toHaveCount(0);
  },
  'the workflow is authoritatively cancelled': async (_page, state) => {
    await request(state, '/cancel');
    await expect
      .poll(
        async () => (await request(state, '/status', 'GET')).workflow?.state,
      )
      .toBe('cancelled');
  },
  'its cards and selected feed disappear and the direct route is reconciled':
    async (page, state) => {
      await expect(
        page.getByRole('button', { name: /Writer|Companion/ }),
      ).toHaveCount(0);
      await expect(feed(page)).toHaveCount(0);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .not.toBe('/workflows/' + state.runId);
    },
  'the known-empty view says No Workflows Running': async (page) => {
    await expect(
      page.getByRole('heading', { name: 'No Workflows Running', exact: true }),
    ).toBeVisible();
  },
};
