import { PostgresAgentDelegationRepository } from '@codex/db';
import {
  createDelegationService,
  type DelegationRepository,
  type DelegationServiceDependencies,
} from '@codex/process';
import {
  createDelegationObservation,
  type DelegationObservationOptions,
} from './delegation-observation.service.js';

export type {
  DelegationActivity,
  DelegationObservationOptions,
} from './delegation-observation.service.js';

export function createDelegationDaemon(
  repository: DelegationRepository,
  hosts: DelegationServiceDependencies['hosts'],
  workspaces: DelegationServiceDependencies['workspaces'],
  options: DelegationObservationOptions = {},
) {
  if (!options.onState && !options.onActivity)
    return {
      ...createDelegationService({ repository, hosts, workspaces }),
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    };
  const observation = createDelegationObservation(
    repository,
    hosts,
    options,
    (id, event) => service.observeAgent(id, event),
  );
  const service = createDelegationService({
    repository: observation.repository,
    hosts: observation.hosts,
    workspaces,
  });
  return { ...service, start: observation.start, stop: observation.stop };
}

export function createProductionDelegationDaemon(
  processDatabaseUrl: string,
  hosts: DelegationServiceDependencies['hosts'],
  workspaces: DelegationServiceDependencies['workspaces'],
  options: DelegationObservationOptions = {},
) {
  return createDelegationDaemon(
    new PostgresAgentDelegationRepository(processDatabaseUrl),
    hosts,
    workspaces,
    options,
  );
}
