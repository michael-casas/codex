import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Before, After, When, Then } from '@cucumber/cucumber';
import {
  observationRecoveryScenario,
  serializationScenario,
} from './support/observation-recovery.driver.js';
When(
  'an observer loses its fixture database listener before a workflow fails',
  { timeout: 15000 },
  async function () {
    this.result = await observationRecoveryScenario();
  },
);
Then(
  'public reads report degradation and recover the unchanged terminal history',
  function () {
    assert.deepEqual(this.result, {
      degradedStatus: 500,
      degradedCode: 'VISIBILITY_OBSERVER_UNAVAILABLE',
      terminal: true,
      historyPreserved: true,
      replayTerminal: true,
      eventCount: 2,
      sourceCount: 2,
    });
  },
);
When(
  'fixture snapshot serialization and wait operations fail',
  async function () {
    this.result = await serializationScenario();
  },
);
Then('both public operations return well-formed safe error JSON', function () {
  assert.deepEqual(this.result, {
    snapshot: { status: 500, body: { code: 'CONTROL_OPERATION_FAILED' } },
    wait: { status: 500, body: { code: 'CONTROL_OPERATION_FAILED' } },
  });
});
When(
  'the provider reports the bound fixture turn was interrupted without output',
  async function () {
    const { interruptedBindingScenario } = await import(
      './support/observation-recovery.driver.js'
    );
    this.result = await interruptedBindingScenario();
  },
);
Then(
  'reconciliation reports a terminal interruption without starting another agent',
  function () {
    assert.deepEqual(this.result, {
      code: 'WORKFLOW_TURN_INTERRUPTED',
      retryable: false,
      ambiguous: false,
      starts: 0,
      reads: 1,
      childExited: true,
      pendingRequests: 0,
    });
  },
);

Before(function () {
  this.originalDirectory = process.cwd();
  let root = process.cwd();
  while (!existsSync(resolve(root, 'nx.json'))) {
    const parent = dirname(root);
    if (parent === root) throw Error('WORKSPACE_ROOT_MISSING');
    root = parent;
  }
  process.chdir(root);
});
After(function () {
  process.chdir(this.originalDirectory);
});

When(
  'a long synthetic stream repeats a notification and storage rejects its next event',
  { timeout: 60000 },
  async function () {
    const { longObservationScenario } = await import(
      './support/observation-recovery.driver.js'
    );
    this.result = await longObservationScenario();
  },
);
Then(
  'observation preserves terminal history and retains the safe primary storage diagnostic',
  function () {
    const result = this.result;
    assert.equal(result.duplicateWrites, 0);
    assert.equal(result.terminal, true);
    assert.equal(result.eventCount, 2101);
    assert.equal(result.failedStatus, 500);
    assert.deepEqual(result.publicError, {
      code: 'VISIBILITY_OBSERVER_FAILED',
    });
    assert.equal(result.failure.state, 'failed');
    assert.equal(result.failure.cursor, '2101');
    assert.equal(result.failure.recoveryAttempts, 0);
    assert.equal(result.failure.lastFailure.causeCode, '23514');
    assert.equal(result.failure.lastFailure.errorClass, 'DatabaseError');
    assert.equal(result.failure.lastFailure.sourceCursor, '2102');
    assert.equal(result.failure.lastFailure.sourceEventId, result.sourceId);
    assert.doesNotMatch(JSON.stringify(result.failure), /private|credentials/);
  },
);
