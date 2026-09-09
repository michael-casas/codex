import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import { connectAppServer } from '@codex/codex';
import {
  createControlHttpServer,
  type CodexControlPlane,
} from '@codex/control-gateway';
import { PostgresRuntimeVisibilityRepository } from '@codex/db';
import { createAgentMessenger } from '@codex/process';
import {
  createAppServerHostRegistry,
  createWorkspaceLeaseService,
  type AppServerHostInput,
} from '@codex/transport';
import {
  isWorkflowDefinition,
  WorkflowSourceAdmissionError,
  type WorkflowDefinition,
} from '@codex/workflows';

import { createProductionAgentMessagingDaemon } from './agent-messaging/index.js';
import { createProductionDelegationDaemon } from './delegation/index.js';
import { createControlDaemon } from './lifecycle.js';
import { createRuntimeVisibilityDaemon } from './visibility/index.js';
import { projectDelegationVisibility } from './visibility/delegation-visibility.projector.js';
import { createProductionWorkflowExecutionDaemon } from './workflow-execution/index.js';
import {
  createWorkflowSourceModule,
  parseWorkflowSourceRegistrations,
  type WorkflowSourceRegistration,
} from './workflow-execution/workflow-source.module.js';
import {
  createLocalProjectAdmission,
  parseLocalProjectPolicies,
  type LocalProjectPolicy,
} from './workflow-execution/local-project-admission.js';

interface RepositoryConfig {
  readonly hostId: string;
  readonly repositoryId: string;
  readonly checkoutPath: string;
  readonly leaseRoot: string;
}

interface WorkflowConfig {
  readonly workflowRef: string;
  readonly modulePath: string;
}

export interface ProductionControlConfig {
  readonly hosts: readonly AppServerHostInput[];
  readonly repositories: readonly RepositoryConfig[];
  readonly workflows: readonly WorkflowConfig[];
  readonly workflowSources?: readonly WorkflowSourceRegistration[];
  readonly localProjectPolicies?: readonly LocalProjectPolicy[];
  readonly viewer: {
    readonly host: '127.0.0.1';
    readonly port: number;
    readonly tokenFile: string;
    readonly uiDirectory: string;
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('CONTROL_CONFIG_INVALID');
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('CONTROL_CONFIG_INVALID');
}

function absolute(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value))
    throw new Error('CONTROL_CONFIG_INVALID');
  return value;
}

export function parseProductionControlConfig(
  value: unknown,
): ProductionControlConfig {
  const config = record(value);
  exact(config, [
    'hosts',
    'repositories',
    'workflows',
    'viewer',
    ...('workflowSources' in config ? ['workflowSources'] : []),
    ...('localProjectPolicies' in config ? ['localProjectPolicies'] : []),
  ]);
  const workflowSources = parseWorkflowSourceRegistrations(
    config['workflowSources'],
  );
  const localProjectPolicies = parseLocalProjectPolicies(
    config['localProjectPolicies'],
  );
  if (
    !Array.isArray(config['hosts']) ||
    config['hosts'].length === 0 ||
    !Array.isArray(config['repositories']) ||
    (config['repositories'].length === 0 &&
      localProjectPolicies.length === 0) ||
    !Array.isArray(config['workflows']) ||
    (config['workflows'].length === 0 &&
      workflowSources.length === 0 &&
      localProjectPolicies.length === 0)
  )
    throw new Error('CONTROL_CONFIG_INVALID');
  const repositories = config['repositories'].map((entry) => {
    const repository = record(entry);
    exact(repository, ['hostId', 'repositoryId', 'checkoutPath', 'leaseRoot']);
    if (
      !ID.test(String(repository['hostId'] ?? '')) ||
      !ID.test(String(repository['repositoryId'] ?? ''))
    )
      throw new Error('CONTROL_CONFIG_INVALID');
    return {
      hostId: String(repository['hostId']),
      repositoryId: String(repository['repositoryId']),
      checkoutPath: absolute(repository['checkoutPath']),
      leaseRoot: absolute(repository['leaseRoot']),
    };
  });
  const workflows = config['workflows'].map((entry) => {
    const workflow = record(entry);
    exact(workflow, ['workflowRef', 'modulePath']);
    if (!ID.test(String(workflow['workflowRef'] ?? '')))
      throw new Error('CONTROL_CONFIG_INVALID');
    const modulePath = absolute(workflow['modulePath']);
    if (!/\.(?:m?js)$/.test(modulePath))
      throw new Error('CONTROL_CONFIG_INVALID');
    return { workflowRef: String(workflow['workflowRef']), modulePath };
  });
  if (
    new Set(
      repositories.map(
        ({ hostId, repositoryId }) => `${hostId}\0${repositoryId}`,
      ),
    ).size !== repositories.length ||
    new Set(workflows.map(({ workflowRef }) => workflowRef)).size !==
      workflows.length
  )
    throw new Error('CONTROL_CONFIG_INVALID');
  const viewer = record(config['viewer']);
  exact(viewer, ['host', 'port', 'tokenFile', 'uiDirectory']);
  if (
    viewer['host'] !== '127.0.0.1' ||
    !Number.isInteger(viewer['port']) ||
    Number(viewer['port']) < 0 ||
    Number(viewer['port']) > 65_535
  )
    throw new Error('CONTROL_CONFIG_INVALID');
  return {
    hosts: config['hosts'] as AppServerHostInput[],
    repositories,
    workflows,
    ...(workflowSources.length ? { workflowSources } : {}),
    ...(localProjectPolicies.length ? { localProjectPolicies } : {}),
    viewer: {
      host: '127.0.0.1',
      port: Number(viewer['port']),
      tokenFile: absolute(viewer['tokenFile']),
      uiDirectory: absolute(viewer['uiDirectory']),
    },
  };
}

async function ownerOnlyFile(path: string): Promise<string> {
  const metadata = await stat(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0)
    throw new Error('CONTROL_SECRET_FILE_UNSAFE');
  const value = (await readFile(path, 'utf8')).trim();
  if (Buffer.byteLength(value, 'utf8') < 32)
    throw new Error('CONTROL_SECRET_INVALID');
  return value;
}

export async function loadProductionControlConfig(
  path: string,
): Promise<ProductionControlConfig> {
  const source = absolute(path);
  const metadata = await stat(source);
  if (!metadata.isFile()) throw new Error('CONTROL_CONFIG_INVALID');
  return parseProductionControlConfig(
    JSON.parse(await readFile(source, 'utf8')),
  );
}

async function workflow(
  config: ProductionControlConfig,
  workflowRef: string,
): Promise<{
  definition: WorkflowDefinition;
  sourceDigest: `sha256:${string}`;
}> {
  const entry = config.workflows.find(
    (candidate) => candidate.workflowRef === workflowRef,
  );
  if (!entry) throw new Error('WORKFLOW_NOT_CONFIGURED');
  const source = await readFile(entry.modulePath);
  const sourceDigest =
    `sha256:${createHash('sha256').update(source).digest('hex')}` as const;
  const loaded = (await import(
    `${pathToFileURL(entry.modulePath).href}?digest=${sourceDigest}`
  )) as { default?: unknown };
  if (!isWorkflowDefinition(loaded.default))
    throw new Error('WORKFLOW_MODULE_INVALID');
  return { definition: loaded.default, sourceDigest };
}

export async function createProductionControlRuntime(
  processDatabaseUrl: string,
  deliveryAdminDatabaseUrl: string,
  config: ProductionControlConfig,
) {
  const hosts = createAppServerHostRegistry({
    connectAppServer,
    async resolveCredential(reference) {
      if (!ENVIRONMENT_NAME.test(reference))
        throw new Error('CONTROL_CREDENTIAL_REFERENCE_INVALID');
      const tokenFile = process.env[reference];
      if (!tokenFile) throw new Error('CONTROL_CREDENTIAL_MISSING');
      return ownerOnlyFile(absolute(tokenFile));
    },
  });
  for (const host of config.hosts) hosts.register(host);
  const projects = await createLocalProjectAdmission({
    policies: config.localProjectPolicies ?? [],
    hosts: config.hosts,
    repositories: config.repositories,
    workflowSources: config.workflowSources ?? [],
  });
  const workspaces = createWorkspaceLeaseService({
    hosts,
    async resolveRepository(identity) {
      const repository = projects.repositories.find(
        (candidate) =>
          candidate.hostId === identity.hostId &&
          candidate.repositoryId === identity.repositoryId,
      );
      if (!repository) throw new Error('REPOSITORY_NOT_CONFIGURED');
      return repository;
    },
  });
  const messaging = createProductionAgentMessagingDaemon(
    processDatabaseUrl,
    deliveryAdminDatabaseUrl,
    hosts as never,
  );
  const delegation = createProductionDelegationDaemon(
    processDatabaseUrl,
    hosts as never,
    workspaces,
    {
      onState: (state) => refreshDelegations(state.delegationId),
      async onActivity(state, activity) {
        await visibility.observe({
          ...activity,
          eventId: randomUUID(),
          source: 'delegation',
          occurredAt: new Date().toISOString(),
          workflowId: `handoff:${state.agentId}`,
          agentId: state.agentId,
          stepId: 'handoff',
          phase: 'Direct handoff',
          title: state.command.assignmentRef,
          status: state.state,
        });
      },
    },
  );
  const sourceModule = createWorkflowSourceModule(
    projects.workflowSources,
    projects.repositories,
    (command, authorization) => workflows.runWorkflow(command, authorization),
  );
  const workflows = createProductionWorkflowExecutionDaemon(
    processDatabaseUrl,
    deliveryAdminDatabaseUrl,
    {
      hosts,
      workspaces,
      registerRuntime: (runtime, ownerAgentId) => messaging.store.registerOwned(runtime, ownerAgentId),
      resolveWorkflow: (workflowRef) =>
        workflowRef.startsWith('source.')
          ? sourceModule.resolveSource(workflowRef)
          : workflow(config, workflowRef),
    },
  );
  const visibilityRepository = new PostgresRuntimeVisibilityRepository(
    processDatabaseUrl,
  );
  const visibility = createRuntimeVisibilityDaemon(visibilityRepository, {
    sourcePage: (after) => visibilityRepository.sourcePage(after),
    listenSource: (notify, fail) =>
      visibilityRepository.listenSource(notify, fail),
  });
  async function refreshDelegations(onlyId?: string) {
    let after: string | undefined;
    while (true) {
      const snapshots = await visibilityRepository.delegationPage(
        after,
        onlyId,
      );
      for (const snapshot of snapshots)
        for (const event of projectDelegationVisibility(snapshot))
          if (event) await visibilityRepository.ingest(event);
      if (snapshots.length < 1000 || onlyId) return;
      after = snapshots[snapshots.length - 1].delegationId;
    }
  }
  const visibilityResource = {
    async start() {
      await visibility.start();
      try {
        await refreshDelegations();
      } catch (error) {
        await visibility.stop();
        throw error;
      }
    },
    stop: visibility.stop,
  };
  const messenger = createAgentMessenger(messaging.store);
  const controlImplementation: CodexControlPlane = {
    admitProject: projects.admitProject,
    delegateAgent: async (command, authorization) =>
      delegation.delegateAgent(
        (await projects.authorizeCommand(command, authorization)) as never,
        authorization,
      ),
    sendAgentMessage: (kind, command, authorization) =>
      messenger[kind](command as never, authorization),
    runWorkflow: async (command, authorization) => {
      if (command && typeof command === 'object' && 'source' in command) {
        await projects.validateSource(command, authorization);
        return sourceModule.submitSource(command, authorization);
      }
      if (
        command &&
        typeof command === 'object' &&
        'workflowRef' in command &&
        String(command.workflowRef).startsWith('source.')
      )
        throw new WorkflowSourceAdmissionError(
          'WORKFLOW_SOURCE_REQUIRES_ADMISSION',
        );
      return workflows.runWorkflow(
        (await projects.authorizeCommand(command, authorization)) as never,
        authorization,
      );
    },
    cancelAgent: (delegationId) => delegation.cancelAgent(delegationId),
    cancelWorkflow: (runId) => workflows.cancelWorkflow(runId),
    snapshot: (query) => visibility.snapshot(query),
    wait: (query, _authorization, signal) => visibility.wait(query, signal),
  };
  const control = Object.freeze(controlImplementation);
  const token = await ownerOnlyFile(config.viewer.tokenFile);
  const viewer = createControlHttpServer({
    control,
    token,
    uiDirectory: config.viewer.uiDirectory,
    host: config.viewer.host,
    port: config.viewer.port,
  });
  let browserOrigin: string | undefined;
  const viewerResource = {
    async start() {
      browserOrigin = (await viewer.start()).origin;
    },
    async stop() {
      browserOrigin = undefined;
      await viewer.stop();
    },
  };
  const hostResource = {
    start: () => Promise.resolve(),
    async stop() {
      for (const host of config.hosts)
        await hosts.disable(host.hostId).catch(() => undefined);
    },
  };
  const lifecycle = createControlDaemon(
    hostResource,
    visibilityResource,
    messaging,
    delegation,
    workflows,
    viewerResource,
  );
  return Object.freeze({
    ...lifecycle,
    control,
    hosts,
    workspaces,
    messaging,
    delegation,
    workflows,
    visibility,
    get browserOrigin() {
      return browserOrigin;
    },
  });
}
