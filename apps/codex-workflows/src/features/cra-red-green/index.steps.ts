import assert from 'node:assert/strict';

import {
  Given,
  setDefaultTimeout,
  setWorldConstructor,
  Then,
  When,
  World,
} from '@cucumber/cucumber';

import { CraRedGreenDriver } from './support/driver.js';

setDefaultTimeout(1_260_000);

class CraRedGreenWorld extends World {
  driver?: CraRedGreenDriver;
}

setWorldConstructor(CraRedGreenWorld);

Given(
  'the canonical CRA RED to GREEN workflow and isolated proof root are admitted',
  function (this: CraRedGreenWorld) {
    this.driver = new CraRedGreenDriver();
    assert.deepEqual(this.driver.prepare(), {
      exactShebang: true,
      executable: true,
      builtBinary: true,
    });
  },
);

When(
  'the workflow executes through its literal installed shebang with the live backend',
  async function (this: CraRedGreenWorld) {
    assert.ok(this.driver);
    await this.driver.execute();
    this.driver.assertExecutionSucceeded();
  },
);

Then(
  'exactly three sequential Luna medium stages complete as builder auditor and remediator',
  function (this: CraRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertTopology();
  },
);

Then(
  'the pinned Create React App baseline receives an immutable independent RED audit',
  function (this: CraRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertRedAudit();
  },
);

Then(
  'the remediator consumes that RED makes the fixed audit GREEN and stops READY_FOR_EXTERNAL_AUDIT',
  function (this: CraRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertGreenStop();
  },
);

Then(
  'the journal report generated source tree and resource delta are complete and bounded',
  function (this: CraRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertEvidenceAndResources();
  },
);
