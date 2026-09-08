import assert from 'node:assert/strict';

import {
  Given,
  setDefaultTimeout,
  setWorldConstructor,
  Then,
  When,
  World,
} from '@cucumber/cucumber';

import { BunReactRedGreenDriver } from './support/driver.js';

setDefaultTimeout(1_260_000);

class BunReactRedGreenWorld extends World {
  driver?: BunReactRedGreenDriver;
}

setWorldConstructor(BunReactRedGreenWorld);

Given(
  'the canonical Bun React RED to GREEN workflow and isolated proof root are admitted',
  function (this: BunReactRedGreenWorld) {
    this.driver = new BunReactRedGreenDriver();
    assert.deepEqual(this.driver.prepare(), {
      exactShebang: true,
      executable: true,
      builtBinary: true,
    });
  },
);

When(
  'the workflow executes through its literal installed shebang with the live backend',
  async function (this: BunReactRedGreenWorld) {
    assert.ok(this.driver);
    await this.driver.execute();
    this.driver.assertExecutionSucceeded();
  },
);

Then(
  'exactly three sequential Luna low stages complete as builder auditor and remediator',
  function (this: BunReactRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertTopology();
  },
);

Then(
  'the pinned Bun and Vite React baseline receives an immutable independent RED audit',
  function (this: BunReactRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertRedAudit();
  },
);

Then(
  'the remediator consumes that RED makes the fixed audit GREEN and stops READY_FOR_EXTERNAL_AUDIT',
  function (this: BunReactRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertGreenStop();
  },
);

Then(
  'the journal report generated source tree and resource delta are complete and bounded',
  function (this: BunReactRedGreenWorld) {
    assert.ok(this.driver);
    this.driver.assertEvidenceAndResources();
  },
);
