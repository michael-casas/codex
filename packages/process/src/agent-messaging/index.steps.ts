import assert from 'node:assert/strict';

import { Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';

import * as processPackage from '../index.js';
import {
  runIntercomScenario,
  type IntercomScenarioResult,
} from './support/intercom-driver.js';

setDefaultTimeout(30_000);

interface IntercomWorld {
  api?: Record<string, unknown>;
  result?: IntercomScenarioResult;
}

Given(
  'two registered agents on local and controlled authenticated remote App Server hosts',
  function (this: IntercomWorld) {
    const candidate = (processPackage as Record<string, unknown>)
      .createAgentMessenger;
    assert.equal(
      typeof candidate,
      'function',
      'CAS-05 one-call intercom API is not implemented',
    );
    this.api = { candidate };
  },
);

When(
  'the local agent asks the remote agent and the remote agent replies',
  async function (this: IntercomWorld) {
    assert.ok(this.api);
    this.result = await runIntercomScenario();
  },
);

Then(
  'the local agent observes one correlated reply and duplicate delivery creates one visible message',
  function (this: IntercomWorld) {
    assert.ok(this.result);
    assert.equal(this.result.replyCorrelationId, this.result.askCorrelationId);
    assert.equal(this.result.pendingReplies, 1);
    assert.equal(this.result.visibleRemoteMessages, 1);
    assert.equal(this.result.replyReplayed, true);
  },
);
