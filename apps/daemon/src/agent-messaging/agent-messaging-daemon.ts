import { PostgresAgentMessageStore } from '@codex/db';
import type { AgentMessageAppServerRegistry } from '@codex/delivery';
import {
  AgentMessageDeliveryRuntime,
  createAgentMessageDeliveryWorker,
} from '@codex/delivery';

export function createAgentMessagingDaemon(
  store: PostgresAgentMessageStore,
  delivery: AgentMessageDeliveryRuntime,
  hosts: AgentMessageAppServerRegistry,
) {
  return {
    async start() {
      await delivery.start();
      await delivery.work(createAgentMessageDeliveryWorker(store, hosts));
    },
    async stop() {
      await delivery.stop();
    },
  };
}

export function createProductionAgentMessagingDaemon(
  processDatabaseUrl: string,
  deliveryAdminDatabaseUrl: string,
  hosts: AgentMessageAppServerRegistry,
) {
  const delivery = new AgentMessageDeliveryRuntime(
    processDatabaseUrl,
    deliveryAdminDatabaseUrl,
  );
  const store = new PostgresAgentMessageStore(processDatabaseUrl, delivery);
  return {
    ...createAgentMessagingDaemon(store, delivery, hosts),
    store,
    delivery,
  };
}
