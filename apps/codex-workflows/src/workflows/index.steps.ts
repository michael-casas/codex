import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import {
  After,
  Given,
  Then,
  When,
  setWorldConstructor,
  World,
} from '@cucumber/cucumber';

function workspaceRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

class WorkflowsWorld extends World {
  readonly workspace = workspaceRoot();
  readonly executable = resolve(
    this.workspace,
    'apps/codex-workflows/dist/main.js',
  );
  readonly workflow = resolve(
    this.workspace,
    'apps/codex-workflows/examples/canonical-review.workflow.json',
  );
  readonly input = resolve(
    this.workspace,
    'apps/codex-workflows/examples/canonical-review.input.json',
  );
  readonly piGoal = resolve(
    this.workspace,
    '.pi/goals/archived/goal_2026071612024695_mrn48esr-mggbiz.md',
  );
  before = new Map<string, string>();
  localRuns: SpawnSyncReturns<string>[] = [];
  run?: SpawnSyncReturns<string>;
  repositoryFiles: string[] = [];
  directRoot?: string;
  directSource?: string;
  directInput?: string;
  directTrace?: string;
  directState?: string;
  directRun?: SpawnSyncReturns<string>;
  directInspections: SpawnSyncReturns<string>[] = [];
}

setWorldConstructor(WorkflowsWorld);

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function invoke(
  world: WorkflowsWorld,
  args: string[],
  env: NodeJS.ProcessEnv = { ...process.env },
) {
  return spawnSync(process.execPath, [world.executable, ...args], {
    cwd: world.workspace,
    encoding: 'utf8',
    env,
  });
}

function controlledCodex(world: WorkflowsWorld): string {
  return resolve(
    world.workspace,
    'packages/codex/src/fixtures/controlled-codex.mjs',
  );
}

function directEnvironment(
  world: WorkflowsWorld,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  assert.ok(world.directTrace);
  assert.ok(world.directState);
  return {
    ...process.env,
    CODEX_WORKFLOWS_CODEX_PATH: controlledCodex(world),
    CODEX_WORKFLOWS_HOME: world.directState,
    CODEX_TEST_TRACE: world.directTrace,
    ...extra,
  };
}

function controlledWorkflowSource(world: WorkflowsWorld): string {
  return readFileSync(
    resolve(
      world.workspace,
      'apps/codex-workflows/src/workflows/support/controlled.workflow.fixture.txt',
    ),
    'utf8',
  );
}

function controlledInput(): string {
  return `${JSON.stringify({
    mode: 'success',
    topic: 'sensitive-input-topic',
  })}\n`;
}

After(function (this: WorkflowsWorld) {
  if (this.directRoot) {
    rmSync(this.directRoot, { force: true, recursive: true });
    this.directRoot = undefined;
  }
});

Given(
  'the canonical workflow source and input have been hashed',
  function (this: WorkflowsWorld) {
    this.before.set(this.workflow, hash(this.workflow));
    this.before.set(this.input, hash(this.input));
  },
);

When(
  'the user validates, inspects, plans, and dry-runs them through codex-workflows',
  function (this: WorkflowsWorld) {
    this.localRuns = [
      invoke(this, [
        'validate',
        this.workflow,
        '--input',
        this.input,
        '--json',
      ]),
      invoke(this, ['inspect', this.workflow, '--json']),
      invoke(this, ['plan', this.workflow, '--input', this.input, '--json']),
      invoke(this, ['dry-run', this.workflow, '--input', this.input, '--json']),
    ];
  },
);

Then(
  'every local command succeeds with one definition digest',
  function (this: WorkflowsWorld) {
    assert.deepEqual(
      this.localRuns.map((run) => run.status),
      [0, 0, 0, 0],
    );
    const payloads = this.localRuns.map(
      (run) => JSON.parse(run.stdout) as { definitionDigest?: string },
    );
    assert.equal(
      new Set(payloads.map((item) => item.definitionDigest)).size,
      1,
    );
    assert.match(payloads[0]?.definitionDigest ?? '', /^sha256:[a-f0-9]{64}$/);
  },
);

Then('the dry-run reports zero side effects', function (this: WorkflowsWorld) {
  const payload = JSON.parse(this.localRuns[3]?.stdout ?? '{}') as {
    sideEffects?: unknown[];
    sdkInitialized?: boolean;
    durableWrites?: number;
  };
  assert.deepEqual(payload.sideEffects, []);
  assert.equal(payload.sdkInitialized, false);
  assert.equal(payload.durableWrites, 0);
});

Then(
  'the workflow source and input bytes remain unchanged',
  function (this: WorkflowsWorld) {
    assert.equal(hash(this.workflow), this.before.get(this.workflow));
    assert.equal(hash(this.input), this.before.get(this.input));
  },
);

Given(
  'a repository sentinel records the current local state',
  function (this: WorkflowsWorld) {
    this.repositoryFiles = readdirSync(this.workspace).sort();
    this.before.set(this.piGoal, hash(this.piGoal));
  },
);

When(
  'the user asks codex-workflows to run the canonical workflow',
  function (this: WorkflowsWorld) {
    this.run = invoke(this, [
      'run',
      this.workflow,
      '--input',
      this.input,
      '--json',
    ]);
  },
);

Then(
  'the command fails with CONTROL_PLANE_UNAVAILABLE and exit 69',
  function (this: WorkflowsWorld) {
    assert.equal(this.run?.status, 69, this.run?.stderr);
    const payload = JSON.parse(this.run?.stderr ?? '{}') as {
      code?: string;
      exitCode?: number;
    };
    assert.equal(payload.code, 'CONTROL_PLANE_UNAVAILABLE');
    assert.equal(payload.exitCode, 69);
  },
);

Then(
  'no repository sentinel or legacy state changes',
  function (this: WorkflowsWorld) {
    assert.deepEqual(readdirSync(this.workspace).sort(), this.repositoryFiles);
    assert.equal(hash(this.piGoal), this.before.get(this.piGoal));
  },
);

Given(
  'an observed pi version 3 goal has been hashed',
  function (this: WorkflowsWorld) {
    this.before.set(this.piGoal, hash(this.piGoal));
  },
);

When(
  'the user imports the pi goal through codex-workflows',
  function (this: WorkflowsWorld) {
    this.run = invoke(this, ['import-pi', this.piGoal, '--json']);
  },
);

Then(
  'the mapping retains the legacy goal identity as historical claims',
  function (this: WorkflowsWorld) {
    assert.equal(this.run?.status, 0, this.run?.stderr);
    const payload = JSON.parse(this.run?.stdout ?? '{}') as {
      goalIds?: string[];
      historicalClaims?: unknown[];
    };
    assert.deepEqual(payload.goalIds, ['mrn48esr-mggbiz']);
    assert.ok((payload.historicalClaims?.length ?? 0) > 0);
  },
);

Then('the pi goal bytes remain unchanged', function (this: WorkflowsWorld) {
  assert.equal(hash(this.piGoal), this.before.get(this.piGoal));
});

Given(
  'a controlled trusted TypeScript workflow and input',
  function (this: WorkflowsWorld) {
    mkdirSync(resolve(this.workspace, 'tmp'), { recursive: true });
    this.directRoot = mkdtempSync(
      resolve(this.workspace, 'tmp/cucumber-direct-runner-'),
    );
    this.directSource = join(this.directRoot, 'controlled.workflow.ts');
    this.directInput = join(this.directRoot, 'success.input.json');
    this.directTrace = join(this.directRoot, 'controlled-codex.jsonl');
    this.directState = join(this.directRoot, 'state');
    writeFileSync(this.directSource, controlledWorkflowSource(this));
    writeFileSync(this.directInput, controlledInput());
    writeFileSync(this.directTrace, '');
    chmodSync(this.directSource, 0o755);
    chmodSync(controlledCodex(this), 0o755);
  },
);

When(
  'the user executes the workflow through its codex-workflows shebang',
  function (this: WorkflowsWorld) {
    assert.ok(this.directRoot);
    assert.ok(this.directSource);
    assert.ok(this.directInput);
    const bin = join(this.directRoot, 'bin');
    mkdirSync(bin);
    chmodSync(this.executable, 0o755);
    symlinkSync(this.executable, join(bin, 'codex-workflows'));
    this.directRun = spawnSync(
      this.directSource,
      ['--input', this.directInput, '--json'],
      {
        cwd: this.workspace,
        encoding: 'utf8',
        env: directEnvironment(this, {
          PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
        }),
      },
    );
  },
);

Then(
  'the two research agents overlap and the consolidator receives both actual outputs',
  function (this: WorkflowsWorld) {
    assert.equal(this.directRun?.status, 0, this.directRun?.stderr);
    const payload = JSON.parse(this.directRun?.stdout ?? '{}') as {
      output?: {
        research?: { cqrs?: string; graphql?: string };
        proposal?: string;
      };
    };
    assert.deepEqual(payload.output?.research, {
      cqrs: 'cqrs-official-result',
      graphql: 'graphql-official-result',
    });
    assert.equal(
      payload.output?.proposal,
      'decision-ready-resolver-factory-proposal',
    );
    assert.ok(this.directTrace);
    const entries = readFileSync(this.directTrace, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const started = entries.filter((entry) => entry.type === 'started');
    const completed = entries.filter((entry) => entry.type === 'completed');
    assert.equal(started.length, 3);
    assert.equal(completed.length, 3);
    const consolidator = started.find((entry) =>
      String(entry.input).includes('__CONSOLIDATE__'),
    );
    assert.match(String(consolidator?.input), /cqrs-official-result/);
    assert.match(String(consolidator?.input), /graphql-official-result/);
    const firstCompletion = Math.min(
      ...completed.map((entry) => Number(entry.atMs)),
    );
    const researchStarted = started.filter(
      (entry) =>
        String(entry.input).includes('__CQRS__') ||
        String(entry.input).includes('__GRAPHQL__'),
    );
    assert.equal(researchStarted.length, 2);
    assert.ok(
      researchStarted.every((entry) => Number(entry.atMs) < firstCompletion),
    );
  },
);

Then(
  'the requested valid gpt models and medium reasoning reach the SDK boundary',
  function (this: WorkflowsWorld) {
    assert.ok(this.directTrace);
    const started = readFileSync(this.directTrace, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.type === 'started');
    const models = started.map((entry) => {
      const args = entry.args as string[];
      return args[args.indexOf('--model') + 1];
    });
    assert.deepEqual(models.sort(), [
      'gpt-5.1-codex',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
    ]);
    assert.ok(
      started.every((entry) =>
        (entry.args as string[]).includes('model_reasoning_effort="medium"'),
      ),
    );
  },
);

Then(
  'the final proposal artifact and completed local journal exist',
  function (this: WorkflowsWorld) {
    const payload = JSON.parse(this.directRun?.stdout ?? '{}') as {
      journalPath?: string;
      output?: { artifact?: { path?: string } };
    };
    assert.ok(payload.journalPath);
    assert.ok(payload.output?.artifact?.path);
    const journal = JSON.parse(readFileSync(payload.journalPath, 'utf8')) as {
      authority?: string;
      status?: string;
    };
    assert.equal(journal.authority, 'local-operational-journal');
    assert.equal(journal.status, 'completed');
    assert.equal(
      readFileSync(payload.output.artifact.path, 'utf8'),
      'decision-ready-resolver-factory-proposal',
    );
  },
);

Then(
  'public workflow state contains digests but no prompt input environment or raw error values',
  function (this: WorkflowsWorld) {
    const payload = JSON.parse(this.directRun?.stdout ?? '{}') as {
      journalPath?: string;
    };
    assert.ok(payload.journalPath);
    const bytes = readFileSync(payload.journalPath, 'utf8');
    assert.match(bytes, /promptDigest/);
    assert.match(bytes, /inputDigest/);
    for (const secret of [
      'private cqrs prompt',
      'private graphql prompt',
      'private consolidator prompt',
      'sensitive-input-topic',
      'controlled raw failure detail',
    ]) {
      assert.doesNotMatch(bytes, new RegExp(secret));
    }
  },
);

When(
  'the user plans and dry-runs the TypeScript workflow',
  function (this: WorkflowsWorld) {
    assert.ok(this.directSource);
    assert.ok(this.directInput);
    this.directInspections = ['--plan', '--dry-run'].map((flag) =>
      invoke(
        this,
        [
          this.directSource as string,
          flag,
          '--input',
          this.directInput as string,
          '--json',
        ],
        directEnvironment(this),
      ),
    );
  },
);

Then(
  'both inspections succeed and report zero launched agents',
  function (this: WorkflowsWorld) {
    assert.deepEqual(
      this.directInspections.map((result) => result.status),
      [0, 0],
    );
    for (const result of this.directInspections) {
      const payload = JSON.parse(result.stdout) as {
        trustedLocalCode?: boolean;
        agentsLaunched?: number;
        dynamicNodeGraph?: boolean;
      };
      assert.equal(payload.trustedLocalCode, true);
      assert.equal(payload.agentsLaunched, 0);
      assert.equal(payload.dynamicNodeGraph, true);
    }
  },
);

Then('the controlled SDK trace remains empty', function (this: WorkflowsWorld) {
  assert.ok(this.directTrace);
  assert.equal(readFileSync(this.directTrace, 'utf8'), '');
});
