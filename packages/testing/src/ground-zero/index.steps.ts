import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  After,
  Given,
  Then,
  When,
  setWorldConstructor,
  World,
} from '@cucumber/cucumber';

class GroundZeroWorld extends World {
  root?: string;
  resultPath?: string;
  run?: SpawnSyncReturns<string>;
}

setWorldConstructor(GroundZeroWorld);

const harnessCli = fileURLToPath(new URL('../cli.ts', import.meta.url));

Given(
  'a project has one independently passing suite in every applicable Ground-0 layer',
  async function (this: GroundZeroWorld) {
    this.root = await mkdtemp(join(tmpdir(), 'orchestration-ground-zero-l3-'));
    this.resultPath = join(this.root, 'result.json');
    const headings = [
      ['l1-unit', '=== Layer 1 Test Suite ==='],
      ['l1-unit', '--- Unit Tests [L1:UNIT] ---'],
      [
        'l1-integration',
        '--- In-Process Integration Tests [L1:INTEGRATION] ---',
      ],
      ['l2-integration', '=== Layer 2 Test Suite ==='],
      [
        'l2-integration',
        '--- Real-Boundary Integration Tests [L2:INTEGRATION] ---',
      ],
      ['l2-e2e', '--- End-to-End Tests [L2:E2E] ---'],
      ['l3', '=== Layer 3 Test Suite ==='],
      ['l3', '--- Cucumber Behavioral Tests ---'],
    ];
    await writeFile(
      join(this.root, 'manifest.json'),
      JSON.stringify({
        project: 'l3-fixture',
        result: this.resultPath,
        temporaryDirectory: join(this.root, 'execution-state'),
        suites: headings.map(([layer, heading]) => ({
          layer,
          heading,
          command: [process.execPath, '-e', 'process.exit(0)'],
          expected: 1,
        })),
      }),
    );
  },
);

When(
  'the developer runs the public Ground-0 aggregate',
  function (this: GroundZeroWorld) {
    assert.ok(this.root);
    this.run = spawnSync(
      'bun',
      [harnessCli, 'aggregate', join(this.root, 'manifest.json')],
      { encoding: 'utf8' },
    );
  },
);

Then(
  'the suites are reported from Layer 1 through Layer 3 in fidelity order',
  function (this: GroundZeroWorld) {
    assert.equal(this.run?.status, 0, this.run?.stderr);
    const expected = [
      '=== Layer 1 Test Suite ===',
      '--- Unit Tests [L1:UNIT] ---',
      '--- In-Process Integration Tests [L1:INTEGRATION] ---',
      '=== Layer 2 Test Suite ===',
      '--- Real-Boundary Integration Tests [L2:INTEGRATION] ---',
      '--- End-to-End Tests [L2:E2E] ---',
      '=== Layer 3 Test Suite ===',
      '--- Cucumber Behavioral Tests ---',
    ];
    let cursor = -1;
    for (const heading of expected) {
      const next = this.run.stdout.indexOf(heading);
      assert.ok(next > cursor, `${heading} was not emitted in order`);
      cursor = next;
    }
  },
);

Then(
  'the aggregate writes valid machine-readable evidence with nonzero selections',
  async function (this: GroundZeroWorld) {
    assert.ok(this.resultPath);
    const result = JSON.parse(await readFile(this.resultPath, 'utf8')) as {
      status: string;
      children: Array<{ selected: number }>;
    };
    assert.equal(result.status, 'passed');
    assert.ok(result.children.length > 0);
    assert.ok(result.children.every((child) => child.selected > 0));
  },
);

Then(
  'no temporary execution state remains',
  async function (this: GroundZeroWorld) {
    assert.ok(this.root);
    assert.ok(!(await readdir(this.root)).includes('execution-state'));
  },
);

After(async function (this: GroundZeroWorld) {
  if (this.root) await rm(this.root, { force: true, recursive: true });
});
