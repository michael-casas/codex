export interface DaemonResource {
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export function createControlDaemon(
  ...resources: readonly DaemonResource[]
): DaemonResource {
  let running = false;
  let started: DaemonResource[] = [];
  return {
    async start() {
      if (running) return;
      try {
        for (const resource of resources) {
          await resource.start();
          started.push(resource);
        }
        running = true;
      } catch (error) {
        for (const resource of started.reverse())
          await resource.stop().catch(() => undefined);
        started = [];
        throw error;
      }
    },
    async stop() {
      if (!running) return;
      running = false;
      const failures: unknown[] = [];
      for (const resource of [...started].reverse()) {
        try {
          await resource.stop();
        } catch (error) {
          failures.push(error);
        }
      }
      started = [];
      if (failures.length)
        throw new AggregateError(failures, 'Control daemon shutdown failed.');
    },
  };
}
