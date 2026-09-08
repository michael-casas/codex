import { PgBoss, type Db, type JobWithMetadata } from 'pg-boss';

import type {
  ControlDeliveryInput,
  TransactionDatabase,
  TransactionalDeliveryWriter,
} from '@codex/db';

export class PgBossDeliveryRuntime implements TransactionalDeliveryWriter {
  private readonly boss: PgBoss;
  private started = false;

  constructor(
    runtimeConnectionString: string,
    private readonly adminConnectionString = runtimeConnectionString,
  ) {
    this.boss = new PgBoss({
      connectionString: runtimeConnectionString,
      createSchema: false,
      migrate: false,
    });
    this.boss.on('error', () => undefined);
  }

  async start(): Promise<void> {
    if (this.started) return;
    const admin = new PgBoss(this.adminConnectionString);
    admin.on('error', () => undefined);
    try {
      await admin.start();
      await admin.createQueue('control-command');
      await admin.getDb().executeSql(`
        GRANT USAGE ON SCHEMA pgboss TO process_daemon;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO process_daemon;
        GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO process_daemon;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO process_daemon;
      `);
    } finally {
      await admin.stop({ graceful: true, close: true, timeout: 5_000 });
    }
    await this.boss.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.boss.stop({ graceful: true, close: true, timeout: 5_000 });
  }

  async ensureQueue(name: string): Promise<void> {
    if (!this.started) throw new Error('DELIVERY_NOT_STARTED');
    await this.boss.createQueue(name);
  }

  async enqueue(
    database: TransactionDatabase & Db,
    commandId: string,
    delivery: ControlDeliveryInput,
  ): Promise<string> {
    if (!this.started) throw new Error('DELIVERY_NOT_STARTED');
    const id = await this.boss.send(
      delivery.queue,
      { ...delivery.data, commandId },
      {
        id: commandId,
        retryLimit: delivery.retryLimit,
        retryDelay: delivery.retryDelaySeconds,
        retryBackoff: delivery.retryBackoff,
        expireInSeconds: delivery.expireInSeconds,
        ...(delivery.deadLetter ? { deadLetter: delivery.deadLetter } : {}),
        db: database,
      },
    );
    if (!id) throw new Error('DELIVERY_JOB_REJECTED');
    return id;
  }

  async findByCommandId(
    commandId: string,
  ): Promise<readonly JobWithMetadata<object>[]> {
    return this.boss.findJobs('control-command', { id: commandId });
  }

  async work(
    queue: string,
    handler: (data: Readonly<Record<string, unknown>>) => Promise<void>,
  ): Promise<string> {
    if (!this.started) throw new Error('DELIVERY_NOT_STARTED');
    return this.boss.work<Record<string, unknown>>(queue, async (jobs) => {
      for (const job of jobs) await handler(job.data);
    });
  }
}
