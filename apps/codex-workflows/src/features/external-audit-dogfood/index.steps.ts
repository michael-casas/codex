import assert from 'node:assert/strict';

import {
  Given,
  setDefaultTimeout,
  setWorldConstructor,
  Then,
  When,
  World,
} from '@cucumber/cucumber';

import { ExternalAuditDogfoodDriver } from './support/driver.js';

setDefaultTimeout(600_000);

class ExternalAuditWorld extends World {
  driver?: ExternalAuditDogfoodDriver;
}

setWorldConstructor(ExternalAuditWorld);

Given(
  'the Attempt 3 literal-shebang workflow and installed interpreter are admitted',
  function (this: ExternalAuditWorld) {
    this.driver = new ExternalAuditDogfoodDriver();
    const admission = this.driver.prepare();
    assert.equal(admission.sourceCount, 1);
    assert.equal(admission.installedWorkspaceBinary, true);
  },
);

When(
  'the auditor executes the Attempt 3 workflow through its literal shebang',
  async function (this: ExternalAuditWorld) {
    assert.ok(this.driver);
    await this.driver.execute();
  },
);

Then(
  'the run completes with exactly two Luna medium roots and one Luna medium join',
  function (this: ExternalAuditWorld) {
    assert.ok(this.driver);
    const result = this.driver.assertCompletedTopology();
    assert.deepEqual(result, { completedNodes: 3, roots: 2, joins: 1 });
  },
);

Then(
  'actual distinct typed upstream values reach the strict-schema consolidator',
  function (this: ExternalAuditWorld) {
    assert.ok(this.driver);
    const result = this.driver.assertTypedDataflowAndSchema();
    assert.deepEqual(result, { distinctDigests: 5, schemaEnforced: true });
  },
);

Then(
  'the journal artifact digests and cleanup obligations are independently satisfied',
  function (this: ExternalAuditWorld) {
    assert.ok(this.driver);
    const result = this.driver.assertArtifactAndCleanup();
    assert.deepEqual(result, {
      artifactDigestValid: true,
      processGroupDelta: 0,
      temporaryResourceDelta: 0,
      unauthorizedWorkspaceDiffDelta: 0,
    });
  },
);
