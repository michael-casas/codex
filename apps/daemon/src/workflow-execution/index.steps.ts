import {
  After,
  Given,
  Then,
  When,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import * as daemon from '../main.js';
import { runRemoteWorkflowScenario } from './support/remote-workflow.driver.js';

setDefaultTimeout(120_000);

interface WorkflowWorld {
  scenario?: Awaited<ReturnType<typeof runRemoteWorkflowScenario>>;
}

Given('an admitted controlled remote App Server workflow host', function () {
  assert.equal(
    typeof (daemon as Record<string, unknown>).createWorkflowExecutionDaemon,
    'function',
    'CAS-07 workflow daemon is not implemented',
  );
});

When(
  'one trusted workflow is submitted through run_workflow',
  async function (this: WorkflowWorld) {
    this.scenario = await runRemoteWorkflowScenario();
  },
);

Then(
  'every research node completes before implementation starts',
  function (this: WorkflowWorld) {
    assert.equal(this.scenario?.stageOrdered, true);
  },
);

Then(
  'the final artifact and result are observable from one stable run handle',
  function (this: WorkflowWorld) {
    assert.equal(this.scenario?.observed.state, 'completed');
    assert.equal(this.scenario?.artifactObserved, true);
    assert.equal(this.scenario?.resultObserved, true);
    assert.equal(this.scenario?.redacted, true);
    assert.equal(this.scenario?.replay.runId, this.scenario?.handle.runId);
  },
);

After(async function (this: WorkflowWorld) {
  await this.scenario?.close();
});
