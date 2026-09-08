import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';

const workspace = resolve(import.meta.dirname, '../../../..');
const writerSelector = 'article[data-item-id="writer-message"]';
interface Fixture {
  child?: ChildProcess;
  exit?: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  origin?: string;
  controlOrigin?: string;
  fixtureRoot?: string;
  runId?: string;
  cleanup?: string;
}
interface BrowserProbe {
  startedAt: number;
  durationMs: number | null;
  observer: MutationObserver;
  timer: ReturnType<typeof setTimeout>;
}
type ProbeWindow = Window & {
  __readablePerformanceProbe?: BrowserProbe;
  __readablePerformanceArticle?: Element | null;
};

async function control(state: Fixture, path: string, method = 'POST') {
  const response = await fetch(state.controlOrigin + path, {
    method,
    headers: { authorization: 'Bearer ' + 's'.repeat(64) },
  });
  expect(response.ok, 'authenticated synthetic control').toBe(true);
  return response.json() as Promise<{ count?: number }>;
}
async function start(state: Fixture) {
  const child = spawn(
    'bun',
    [
      resolve(
        workspace,
        'apps/daemon/src/visibility/support/readable-visibility-runtime.fixture.mjs',
      ),
      '--performance',
    ],
    { cwd: workspace, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  state.child = child;
  state.exit = new Promise((resolveExit) =>
    child.once('exit', (code, signal) => resolveExit({ code, signal })),
  );
  if (!child.stdout) throw Error('PERFORMANCE_FIXTURE_STDOUT_MISSING');
  const lines = createInterface({ input: child.stdout });
  // Fixture emits only bounded synthetic diagnostics; no credentials are attached.
  child.stderr?.resume();
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(
      () => reject(Error('PERFORMANCE_FIXTURE_TIMEOUT')),
      25_000,
    );
    lines.on('line', (line) => {
      try {
        const value = JSON.parse(line);
        if (value.fixtureRoot) state.fixtureRoot = value.fixtureRoot;
        if (value.cleanup) state.cleanup = value.cleanup;
        if (value.origin && value.controlOrigin) {
          Object.assign(state, {
            origin: value.origin,
            controlOrigin: value.controlOrigin,
            runId: value.runId,
          });
          clearTimeout(timer);
          resolveReady();
        }
      } catch {
        /* Non-JSON lines are not fixture readiness. */
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(Error('PERFORMANCE_FIXTURE_EXIT'));
    });
  });
  await expect
    .poll(async () => (await control(state, '/status', 'GET')).count, {
      timeout: 15_000,
    })
    .toBe(2);
}
async function beginProbe(page: Page, needle: string) {
  await page.evaluate(
    ({ selector, needle }) => {
      const current = (window as ProbeWindow).__readablePerformanceProbe;
      current?.observer.disconnect();
      clearTimeout(current?.timer);
      const observer = new MutationObserver(() => {
        const article = document.querySelector(selector);
        if (!article?.textContent?.includes(needle)) return;
        probe.durationMs = performance.now() - probe.startedAt;
        observer.disconnect();
        clearTimeout(probe.timer);
      });
      const probe: BrowserProbe = {
        startedAt: performance.now(),
        durationMs: null,
        observer,
        timer: setTimeout(() => observer.disconnect(), 15_000),
      };
      (window as ProbeWindow).__readablePerformanceProbe = probe;
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    { selector: writerSelector, needle },
  );
}
async function finishProbe(page: Page): Promise<number> {
  const settled = await page.waitForFunction(
    () =>
      (window as ProbeWindow).__readablePerformanceProbe?.durationMs !== null,
    undefined,
    { timeout: 15_000 },
  );
  await settled.dispose();
  return page.evaluate(
    () => (window as ProbeWindow).__readablePerformanceProbe?.durationMs ?? -1,
  );
}
async function resources(page: Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => /\/assets\//.test(entry.name))
      .map((entry) => {
        const timing = entry as PerformanceResourceTiming;
        const path = new URL(timing.name).pathname;
        return {
          path,
          kind: /\.css$/.test(path)
            ? 'css'
            : /\.(woff2?|ttf)$/.test(path)
              ? 'font'
              : /\.js$/.test(path)
                ? 'javascript'
                : 'other',
          initiator: timing.initiatorType,
          encodedBodySize: timing.encodedBodySize,
          decodedBodySize: timing.decodedBodySize,
          transferSize: timing.transferSize,
          durationMs: timing.duration,
          zeroTransfer: timing.transferSize === 0,
        };
      }),
  );
}
async function heap(page: Page) {
  return page.evaluate(() => {
    const memory = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }
    ).memory;
    return memory
      ? {
          available: true,
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          qualification:
            'Coarse nonstandard performance.memory; no forced GC; includes the entire page and library runtime.',
        }
      : { available: false, qualification: 'performance.memory unavailable' };
  });
}
async function parser(page: Page) {
  return page.locator(writerSelector).evaluate((element) => {
    const parser = element.querySelector<HTMLElement>('.message-markdown');
    return {
      epoch: Number(parser?.dataset.parserEpoch ?? -1),
      inputBytes: Number(parser?.dataset.parserInputBytes ?? -1),
      logicalItems: document.querySelectorAll(
        '[aria-label="Agent messages"] article[data-item-id]',
      ).length,
      sameOuterArticle:
        (window as ProbeWindow).__readablePerformanceArticle === element,
    };
  });
}
function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.ceil(sorted.length * fraction) - 1];
  return {
    count: values.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1),
  };
}

// Explicit registration preserves the frozen four-scenario selector, whose grep includes paths.
// === L2: END-TO-END TESTS ===
if (process.env['CAS_UI_R2_PERFORMANCE'] === '1') {
  test('[L2:E2E] R2-PERFORMANCE requested assets and bounded changed-content latency', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const fixture: Fixture = {};
    const requested: { stage: string; path: string; resourceType: string }[] =
      [];
    const selectedWaits = new Set<Request>();
    let maximumSelectedWaits = 0;
    let stage = 'initial';
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/assets/'))
        requested.push({
          stage,
          path: url.pathname,
          resourceType: request.resourceType(),
        });
      if (
        url.pathname === '/api/control/wait' &&
        url.searchParams.has('selectedAgentId')
      ) {
        selectedWaits.add(request);
        maximumSelectedWaits = Math.max(
          maximumSelectedWaits,
          selectedWaits.size,
        );
      }
    });
    page.on('requestfinished', (request) => selectedWaits.delete(request));
    page.on('requestfailed', (request) => selectedWaits.delete(request));
    try {
      await start(fixture);
      await page.goto(fixture.origin + '/workflows/' + fixture.runId);
      await expect(page.getByRole('button', { name: /Writer/ })).toBeVisible();
      const initial = {
        resources: await resources(page),
        heap: await heap(page),
      };
      await page.evaluate(() => performance.clearResourceTimings());
      stage = 'first-feed';
      await beginProbe(page, 'Draft update:');
      await page.getByRole('button', { name: /Writer/ }).click();
      const firstSelectionToDomMs = await finishProbe(page);
      await expect(page.locator(writerSelector)).toBeVisible();
      await expect.poll(() => selectedWaits.size).toBe(1);
      await page.evaluate((selector) => {
        (window as ProbeWindow).__readablePerformanceArticle =
          document.querySelector(selector);
      }, writerSelector);
      const firstFeed = {
        resources: await resources(page),
        heap: await heap(page),
        parser: await parser(page),
        selectedWaits: selectedWaits.size,
      };
      stage = 'updates';
      const samples: {
        index: number;
        actionToDomMs: number;
        parser: Awaited<ReturnType<typeof parser>>;
      }[] = [];
      for (let index = 0; index < 40; index++) {
        const needle = 'Probe-' + String(index).padStart(2, '0') + '.';
        await beginProbe(page, needle);
        await control(fixture, '/append-probe?index=' + index);
        const actionToDomMs = await finishProbe(page);
        const state = await parser(page);
        expect(state.logicalItems).toBe(1);
        expect(state.sameOuterArticle).toBe(true);
        expect(state.inputBytes).toBeLessThanOrEqual(262144);
        samples.push({ index, actionToDomMs, parser: state });
      }
      const afterUpdates = {
        heap: await heap(page),
        parser: await parser(page),
      };
      expect(afterUpdates.parser.epoch).toBeGreaterThan(firstFeed.parser.epoch);
      await page
        .getByRole('button', { name: 'Close agent feed', exact: true })
        .click();
      await expect.poll(() => selectedWaits.size).toBe(0);
      await page.evaluate(() => performance.clearResourceTimings());
      stage = 'warm-reopen';
      await beginProbe(page, 'Probe-39.');
      await page.getByRole('button', { name: /Writer/ }).click();
      const warmSelectionToDomMs = await finishProbe(page);
      await expect(page.locator(writerSelector)).toHaveCount(1);
      await expect.poll(() => selectedWaits.size).toBe(1);
      const warm = {
        resources: await resources(page),
        heap: await heap(page),
        selectedWaits: selectedWaits.size,
      };
      const metrics = {
        project: info.project.name,
        viewport: page.viewportSize(),
        initial,
        firstFeed,
        firstSelectionToDomMs,
        samples,
        updateLatencyMs: percentiles(
          samples.map((sample) => sample.actionToDomMs),
        ),
        afterUpdates,
        warm,
        warmSelectionToDomMs,
        maximumSelectedWaits,
        requested,
        qualifications: [
          'Local loopback fixture, not WAN or production load.',
          'Latency starts at browser probe setup and ends at matching DOM mutation, not paint or reveal completion; includes driver/control-request overhead.',
          'Resource sizes are native ResourceTiming fields, not gzip estimates. Zero transfer can indicate cache/reuse and is not proof of zero decoded cost.',
          'Each browser project receives a fresh page/context; OS caches and HTTP cache behavior were not forcibly purged.',
          'Transient request-event ordering can affect observed maximum waits; stable selected wait counts are asserted after selection and close.',
        ],
      };
      await info.attach('performance-metrics', {
        body: Buffer.from(JSON.stringify(metrics)),
        contentType: 'application/json',
      });
    } finally {
      await page
        .evaluate(() => {
          const probe = (window as ProbeWindow).__readablePerformanceProbe;
          probe?.observer.disconnect();
          clearTimeout(probe?.timer);
        })
        .catch(() => undefined);
      if (fixture.child?.exitCode === null) fixture.child.stdin?.end('stop\n');
      const exit = await fixture.exit;
      const cleanup = {
        child: exit,
        fixtureRoot: fixture.fixtureRoot,
        rootRemoved: Boolean(
          fixture.fixtureRoot && !existsSync(fixture.fixtureRoot),
        ),
        cleanup: fixture.cleanup,
      };
      await info.attach('performance-cleanup', {
        body: Buffer.from(JSON.stringify(cleanup)),
        contentType: 'application/json',
      });
      expect(exit).toEqual({ code: 0, signal: null });
      expect(cleanup.rootRemoved).toBe(true);
      expect(fixture.cleanup).toBe('complete');
    }
  });
}
