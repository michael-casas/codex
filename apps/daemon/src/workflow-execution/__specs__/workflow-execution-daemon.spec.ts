import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as daemon from '../../main.js';
import * as processApi from '@codex/process';
import { PostgresControlStore } from '@codex/db';
import { PgBossDeliveryRuntime } from '@codex/delivery';
import { prepareWorkflowRun } from '@codex/workflows';
import { createControlDatabaseFixture } from '@codex/db/testing';
import {
  runRemoteWorkflowCancellationScenario,
  runRemoteWorkflowScenario,
} from '../support/remote-workflow.driver.js';

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] remote workflow execution', () => {
  it('DELIVERY-EXHAUSTED-L2 marks failed only after real pg-boss retries and preserves replay after restart', async () => {
    const database = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      database.daemonUrl,
      database.ownerUrl,
    );
    const store = new PostgresControlStore(database.daemonUrl, delivery);
    let attempts = 0;
    const service = daemon.createWorkflowExecutionDaemon({
      store,
      delivery,
      workspaces: {
        acquire: async () => {
          attempts++;
          throw Error('CONTROLLED_ACQUIRE_FAILURE');
        },
        resolve: async () => {
          throw Error('UNEXPECTED_RESOLVE');
        },
        release: async () => {
          throw Error('UNEXPECTED_RELEASE');
        },
      },
      hosts: {
        connect: async () => {
          throw Error('UNEXPECTED_CONNECT');
        },
      },
      resolveWorkflow: async () => {
        throw Error('UNEXPECTED_SOURCE');
      },
      createExecutor: () => {
        throw Error('UNEXPECTED_EXECUTOR');
      },
    });
    try {
      await service.start();
      const command = {
        workflowRef: 'failure.check',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: {},
        hostId: 'controlled',
        workspace: {
          repositoryId: 'fixture',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'failure-check',
        },
        runtimeProfile: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'low',
          sandbox: 'readOnly',
          approvalPolicy: 'never',
        },
        idempotencyKey: 'failure-check',
      } as const;
      const handle = await service.runWorkflow(command);
      await expect
        .poll(async () => (await service.readWorkflow(handle.runId)).state, {
          timeout: 30_000,
          interval: 250,
        })
        .toBe('failed');
      expect(attempts).toBe(4);
      await service.stop();
      await service.start();
      expect((await service.runWorkflow(command)).runId).toBe(handle.runId);
      expect((await service.readWorkflow(handle.runId)).state).toBe('failed');
      const events = await store.events(`workflow:${handle.runId}`, '0');
      expect(
        events.filter((event) => event.kind === 'workflow.failed'),
      ).toHaveLength(1);
      expect(
        events.find((event) => event.kind === 'workflow.failed')?.payload,
      ).toEqual({ runId: handle.runId, diagnostic: 'delivery-exhausted' });
      expect(attempts).toBe(4);
    } finally {
      await service.stop();
      await database.close();
    }
  }, 45_000);
  it('WA-L2-DAEMON runs an admitted source file through PostgreSQL delivery and App Server after restart', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'cas-wa-daemon-'));
    let scenario:
      | Awaited<ReturnType<typeof runRemoteWorkflowScenario>>
      | undefined;
    try {
      await writeFile(
        join(sourceRoot, 'demo.workflow.ts'),
        `
        import {defineWorkflow,phase,parallel,agent,artifact} from '@codex/workflows';
        export default defineWorkflow({id:'cas07-remote',run:async()=>{
          const research=await phase('research',()=>parallel({
            north:()=>agent({label:'North research',model:'gpt-5.6-luna',reasoning:'high',prompt:'Return JSON only: {"fact":"N"}.',outputSchema:{type:'object',properties:{fact:{type:'string'}},required:['fact'],additionalProperties:false}}),
            south:()=>agent({label:'South research',model:'gpt-5.6-luna',reasoning:'high',prompt:'Return JSON only: {"fact":"X"}.',outputSchema:{type:'object',properties:{fact:{type:'string'}},required:['fact'],additionalProperties:false}})
          }));
          const result=await phase('implementation',()=>agent({label:'Implementation',model:'gpt-5.6-sol',reasoning:'medium',prompt:'Return JSON only with result equal to the concatenated input fact values.',input:research,outputSchema:{type:'object',properties:{result:{type:'string'}},required:['result'],additionalProperties:false}}));
          await artifact('cas07-result.json',result); return result;
        }});`,
      );
      scenario = await runRemoteWorkflowScenario({
        sourceRoot,
        source: 'demo.workflow.ts',
      });
      expect(scenario.observed.state).toBe('completed');
      expect(scenario.stageOrdered).toBe(true);
      expect(scenario.resultObserved).toBe(true);
      expect(scenario.replay.runId).toBe(scenario.handle.runId);
      expect(scenario.redacted).toBe(true);
    } finally {
      await scenario?.close();
      await rm(sourceRoot, { recursive: true, force: true });
    }
  }, 120_000);
  it('CAS07R1-L2-DURABLE publishes one package client over PostgreSQL and pg-boss', async () => {
    const factory = (processApi as Record<string, unknown>)
      .createDurableWorkflowClient;
    expect(
      factory,
      'CAS-07.R1 package-owned durable workflow client is absent',
    ).toBeTypeOf('function');
    if (typeof factory !== 'function')
      throw new Error('CLIENT_NOT_IMPLEMENTED');
    const fixture = await createControlDatabaseFixture();
    const delivery = new PgBossDeliveryRuntime(
      fixture.daemonUrl,
      fixture.ownerUrl,
    );
    try {
      await delivery.start();
      await delivery.ensureQueue('workflow-execution');
      await delivery.ensureQueue('workflow-execution-dead');
      const store = new PostgresControlStore(fixture.daemonUrl, delivery);
      const client = factory({ store, prepare: prepareWorkflowRun }) as {
        runWorkflow(
          command: unknown,
        ): Promise<{ runId: string; cursor: string }>;
        readWorkflow(
          runId: string,
          cursor?: string,
        ): Promise<Record<string, unknown>>;
        cancelWorkflow(runId: string): Promise<Record<string, unknown>>;
      };
      const command = {
        workflowRef: 'cas07.r1',
        sourceDigest: `sha256:${'a'.repeat(64)}`,
        input: {},
        hostId: 'controlled',
        workspace: {
          repositoryId: 'codex',
          baseRevision: 'b'.repeat(40),
          assignmentId: 'CAS-07.R1',
        },
        runtimeProfile: {
          model: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
          sandbox: 'workspaceWrite',
          approvalPolicy: 'never',
        },
        idempotencyKey: 'cas07-r1-l2',
      };
      const first = await client.runWorkflow(command);
      expect(await client.runWorkflow(command)).toEqual(first);
      const commandEvents = await store.events(
        `workflow:${first.runId.slice('workflow_'.length)}`,
        '0',
      );
      expect(
        commandEvents.filter(({ kind }) => kind === 'delivery.requested'),
      ).toHaveLength(1);
      expect(await client.readWorkflow(first.runId, '0')).toMatchObject({
        runId: first.runId,
        state: 'accepted',
        changed: true,
      });
      await client.cancelWorkflow(first.runId);
      await client.cancelWorkflow(first.runId);
      const events = await store.events(`workflow:${first.runId}`, '0');
      expect(
        events.filter(({ kind }) => kind === 'workflow.cancel.requested'),
      ).toHaveLength(1);
    } finally {
      await delivery.stop().catch(() => undefined);
      await fixture.close();
    }
  });

  it('CAS07-L2-RUNTIME composes durable App Server workflow execution', () => {
    expect(
      (daemon as Record<string, unknown>).createWorkflowExecutionDaemon,
      'CAS-07 App Server workflow execution is not implemented',
    ).toBeTypeOf('function');
  });

  it('CAS07-L2-RECOVERY composes restart and reconnect reconciliation', () => {
    expect(
      (daemon as Record<string, unknown>)
        .createProductionWorkflowExecutionDaemon,
      'CAS-07 production recovery composition is not implemented',
    ).toBeTypeOf('function');
  });

  it('executes parallel and dependent turns through authenticated WSS with durable artifact observation', async () => {
    const scenario = await runRemoteWorkflowScenario();
    try {
      expect(
        scenario.observed.state,
        JSON.stringify(
          scenario.events.map(({ kind, payload }) => ({ kind, payload })),
        ),
      ).toBe('completed');
      expect(scenario.stageOrdered).toBe(true);
      expect(scenario.artifactObserved).toBe(true);
      expect(scenario.resultObserved).toBe(true);
      expect(scenario.redacted).toBe(true);
      expect(scenario.replay.runId).toBe(scenario.handle.runId);
    } finally {
      await scenario.close();
    }
    expect(scenario.releases).toBe(1);
  }, 120_000);

  it('interrupts only the active bound turn and forbids downstream starts', async () => {
    const scenario = await runRemoteWorkflowCancellationScenario();
    try {
      expect(scenario.observed.state).toBe('cancelled');
      expect(scenario.interrupted).toBe(true);
      expect(scenario.downstreamStarted).toBe(false);
    } finally {
      await scenario.close();
    }
    expect(scenario.releases).toBe(1);
  }, 120_000);
});
