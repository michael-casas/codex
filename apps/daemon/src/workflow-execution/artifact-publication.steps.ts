import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { When, Then, After } from '@cucumber/cucumber';
import { createControlDatabaseFixture } from '@codex/db/testing';
import { PostgresControlStore } from '@codex/db';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import { createWorkflowExecutionDaemon } from './workflow-execution-daemon.js';
import {
  artifactCommand,
  artifactDependencies,
  artifactDigest,
  artifactNames,
} from './support/artifact-publication.fixture.js';

interface ArtifactWorld {
  close?: () => Promise<void>;
  observed?: Awaited<
    ReturnType<ReturnType<typeof createWorkflowExecutionDaemon>['readWorkflow']>
  >;
  events?: Awaited<ReturnType<PostgresControlStore['events']>>;
  replayEvents?: Awaited<ReturnType<PostgresControlStore['events']>>;
  modelTurns?: number;
}

When(
  'a fixture workflow publishes mixed-case evidence through durable delivery',
  { timeout: 30000 },
  async function (this: ArtifactWorld) {
    const previousDirectory = process.cwd();
    let root = previousDirectory;
    while (
      !existsSync(resolve(root, 'migrations/process/002_durable_control.sql'))
    ) {
      const parent = dirname(root);
      if (parent === root) throw Error('FIXTURE_ROOT_NOT_FOUND');
      root = parent;
    }
    let database: Awaited<ReturnType<typeof createControlDatabaseFixture>>;
    process.chdir(root);
    try {
      database = await createControlDatabaseFixture();
    } finally {
      process.chdir(previousDirectory);
    }
    const delivery = new PgBossDeliveryRuntime(
      database.daemonUrl,
      database.ownerUrl,
    );
    const store = new PostgresControlStore(database.daemonUrl, delivery);
    this.close = async () => {
      await delivery.stop();
      await database.close();
    };
    const dependencies = artifactDependencies();
    this.modelTurns = 0;
    const service = createWorkflowExecutionDaemon({
      ...dependencies,
      store,
      delivery,
      createExecutor: () => ({
        executeAgent: async () => {
          this.modelTurns! += 1;
          throw Error('PAID_TURNS_FORBIDDEN');
        },
        close: async () => undefined,
      }),
    });
    this.close = async () => {
      await service.stop();
      await database.close();
    };
    await service.start();
    const handle = await service.runWorkflow(artifactCommand);
    let observed = await service.readWorkflow(handle.runId);
    const deadline = Date.now() + 15000;
    while (
      !['completed', 'failed', 'cancelled'].includes(observed.state) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      observed = await service.readWorkflow(handle.runId);
    }
    await service.stop();
    const restarted = createWorkflowExecutionDaemon({
      ...dependencies,
      store: new PostgresControlStore(database.daemonUrl, delivery),
      delivery,
    });
    this.observed = await restarted.readWorkflow(handle.runId);
    this.events = await store.events(`workflow:${handle.runId}`, '0');
    await restarted.runWorkflow(artifactCommand);
    this.replayEvents = await store.events(`workflow:${handle.runId}`, '0');
  },
);
Then(
  'every original artifact name and digest remains visible after service restart',
  function (this: ArtifactWorld) {
    assert.equal(this.observed?.state, 'completed');
    const registered = this.events!.filter(
      (e) => e.kind === 'workflow.artifact.registered',
    );
    assert.deepEqual(
      registered.map((e) => e.payload.name),
      artifactNames,
    );
    assert.deepEqual(
      registered.map((e) => e.payload.digest),
      artifactNames.map(() => artifactDigest),
    );
    assert.equal(
      new Set(registered.map((e) => e.payload.path)).size,
      artifactNames.length,
    );
  },
);
Then(
  'replay preserves one registration per name without model turns',
  function (this: ArtifactWorld) {
    assert.deepEqual(this.replayEvents, this.events);
    assert.equal(
      this.events!.filter((e) => e.kind === 'workflow.artifact.registered')
        .length,
      artifactNames.length,
    );
    assert.equal(this.modelTurns, 0);
  },
);
After(async function (this: ArtifactWorld) {
  await this.close?.();
});
