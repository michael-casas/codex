import assert from 'node:assert/strict';

import {
  Given,
  setDefaultTimeout,
  setWorldConstructor,
  Then,
  When,
  World,
} from '@cucumber/cucumber';

import { DailyFactsDriver } from './support/driver.js';

setDefaultTimeout(900_000);

class DailyFactsWorld extends World {
  driver?: DailyFactsDriver;
}

setWorldConstructor(DailyFactsWorld);

Given(
  'the installed public workflow interpreter and isolated proof root are ready',
  function (this: DailyFactsWorld) {
    this.driver = new DailyFactsDriver();
    const admission = this.driver.prepare();
    assert.equal(admission.installedWorkspaceBinary, true);
  },
);

When(
  'the workflow researches current UTC daily news through its literal shebang',
  async function (this: DailyFactsWorld) {
    assert.ok(this.driver);
    await this.driver.execute();
  },
);

Then(
  'the Founder daily-facts topology content report journal and resource contract is satisfied',
  async function (this: DailyFactsWorld) {
    assert.ok(this.driver);
    this.driver.assertExecutionSucceeded();
    assert.deepEqual(this.driver.assertResearchTopology(), {
      completedNodes: 3,
      concurrentRoots: 3,
      consolidators: 0,
    });
    const briefs = await this.driver.assertCurrentLinkedBriefs();
    assert.equal(briefs.briefs, 3);
    assert.equal(briefs.distinctPairs, 3);
    assert.ok(briefs.directHttpsLinks >= 6);
    assert.deepEqual(this.driver.assertReportAndResources(), {
      artifactDigestValid: true,
      terminalEventLast: true,
      processGroupDelta: 0,
      tmuxDelta: 0,
      temporaryResourceDelta: 0,
      unauthorizedWorkspaceDiffDelta: 0,
    });
  },
);
