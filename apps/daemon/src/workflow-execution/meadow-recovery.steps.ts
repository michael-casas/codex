import assert from 'node:assert/strict';
import { When, Then } from '@cucumber/cucumber';
import {
  meadowLeaseScenario,
  meadowMessagingScenario,
} from './support/meadow-recovery.driver.js';
When(
  'an authenticated coordinator delegates and messages its owned fixture agent',
  { timeout: 30000 },
  async function () {
    this.result = await meadowMessagingScenario();
  },
);
Then(
  'the message is delivered once and foreign recipients remain forbidden',
  function () {
    assert.deepEqual(this.result, {
      ownedDelivered: true,
      foreignDenied: true,
      replayDeduplicated: true,
    });
  },
);
When(
  'two fixture runs acquire workspaces and the lease service restarts',
  { timeout: 30000 },
  async function () {
    this.result = await meadowLeaseScenario();
  },
);
Then(
  'each run owns its workspace and foreign lease evidence remains intact',
  function () {
    assert.deepEqual(this.result, {
      isolated: true,
      recovered: true,
      foreignPreserved: true,
    });
  },
);
