import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ControlAuthorization } from '@codex/control-gateway';
import type { AppServerHostInput } from '@codex/transport';
import {
  prepareWorkflowRun,
  WorkflowSourceAdmissionError,
  type RunWorkflowCommand,
} from '@codex/workflows';
import type { WorkflowSourceRegistration } from './workflow-source.module.js';

const exec = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const REVISION = /^[a-f0-9]{40}$/;
function fail(code: string): never {
  throw new WorkflowSourceAdmissionError(code);
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const within = (root: string, path: string) => {
  const suffix = relative(root, path);
  return suffix === '' || (!suffix.startsWith('..') && !isAbsolute(suffix));
};
const absolute = (value: unknown): value is string =>
  typeof value === 'string' && isAbsolute(value) && !value.includes('\0');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('PROJECT_ADMISSION_INVALID');
  return value as Record<string, unknown>;
}

export interface LocalProjectPolicy {
  readonly actorAgentId: string;
  readonly hostId: string;
  readonly allowedRoots: readonly string[];
  readonly leaseRoot: string;
  readonly registryRoot: string;
  readonly runtimeProfile: RunWorkflowCommand['runtimeProfile'];
}
export interface AdmittedRepository {
  readonly hostId: string;
  readonly repositoryId: string;
  readonly checkoutPath: string;
  readonly leaseRoot: string;
}
interface ProjectAdmission {
  readonly hostId: string;
  readonly repositoryId: string;
  readonly assignmentId: string;
  readonly baseRevision: string;
  readonly checkoutPath: string;
  readonly sourceRoot: string;
  readonly admissionIntent: 'admit-local-project';
}
interface Registration {
  readonly actorAgentId: string;
  readonly project: ProjectAdmission;
}

export function parseLocalProjectPolicies(
  value: unknown,
): readonly LocalProjectPolicy[] {
  if (value === undefined) return [];
  try {
    if (!Array.isArray(value) || value.length > 100)
      fail('PROJECT_POLICY_INVALID');
    const policies = value.map((entry: unknown) => {
      const fields = record(entry);
      const keys = [
        'actorAgentId',
        'hostId',
        'allowedRoots',
        'leaseRoot',
        'registryRoot',
        'runtimeProfile',
      ];
      if (
        Object.keys(fields).length !== keys.length ||
        Object.keys(fields).some((key) => !keys.includes(key)) ||
        typeof fields.actorAgentId !== 'string' ||
        !ID.test(fields.actorAgentId) ||
        typeof fields.hostId !== 'string' ||
        !ID.test(fields.hostId) ||
        !absolute(fields.leaseRoot) ||
        !absolute(fields.registryRoot) ||
        !Array.isArray(fields.allowedRoots) ||
        !fields.allowedRoots.length ||
        fields.allowedRoots.length > 100 ||
        fields.allowedRoots.some(
          (root) => !absolute(root) || resolve(root) === '/',
        )
      )
        fail('PROJECT_POLICY_INVALID');
      const policy = fields as unknown as LocalProjectPolicy;
      prepareWorkflowRun({
        workflowRef: 'policy',
        sourceDigest: `sha256:${'0'.repeat(64)}`,
        input: {},
        hostId: policy.hostId,
        workspace: {
          repositoryId: 'policy',
          assignmentId: 'policy',
          baseRevision: '0'.repeat(40),
        },
        runtimeProfile: policy.runtimeProfile,
        idempotencyKey: 'policy',
      });
      return policy;
    });
    if (
      new Set(
        policies.map((policy) => `${policy.actorAgentId}\0${policy.hostId}`),
      ).size !== policies.length
    )
      fail('PROJECT_POLICY_INVALID');
    return policies;
  } catch {
    return fail('PROJECT_POLICY_INVALID');
  }
}

function parseProject(value: unknown): ProjectAdmission {
  const fields = record(value);
  const keys = [
    'hostId',
    'repositoryId',
    'assignmentId',
    'baseRevision',
    'checkoutPath',
    'sourceRoot',
    'admissionIntent',
  ];
  if (
    Object.keys(fields).length !== keys.length ||
    Object.keys(fields).some((key) => !keys.includes(key)) ||
    ['hostId', 'repositoryId', 'assignmentId'].some(
      (key) => typeof fields[key] !== 'string' || !ID.test(fields[key]),
    ) ||
    typeof fields.baseRevision !== 'string' ||
    !REVISION.test(fields.baseRevision) ||
    !absolute(fields.checkoutPath) ||
    !absolute(fields.sourceRoot) ||
    fields.admissionIntent !== 'admit-local-project'
  )
    fail('PROJECT_ADMISSION_INVALID');
  return {
    hostId: fields.hostId as string,
    repositoryId: fields.repositoryId as string,
    assignmentId: fields.assignmentId as string,
    baseRevision: fields.baseRevision,
    checkoutPath: fields.checkoutPath,
    sourceRoot: fields.sourceRoot,
    admissionIntent: 'admit-local-project',
  };
}

async function ownerDirectory(path: string) {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const metadata = await lstat(path);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o077) !== 0 ||
      (await realpath(path)) !== resolve(path)
    )
      fail('PROJECT_STORAGE_UNSAFE');
  } catch {
    fail('PROJECT_STORAGE_UNSAFE');
  }
}

export async function createLocalProjectAdmission(options: {
  policies: readonly LocalProjectPolicy[];
  hosts: readonly AppServerHostInput[];
  repositories: readonly AdmittedRepository[];
  workflowSources: readonly WorkflowSourceRegistration[];
}) {
  const policies = parseLocalProjectPolicies(options.policies);
  for (const policy of policies) {
    if (
      !options.hosts.some(
        (host) =>
          host.hostId === policy.hostId && host.transport === 'local-proxy',
      )
    )
      fail('PROJECT_POLICY_LOCAL_HOST_REQUIRED');
  }
  const repositories = [...options.repositories];
  const workflowSources = [...options.workflowSources];
  const registrations: Registration[] = [];
  const policyFor = (actorAgentId: string, hostId: string) =>
    policies.find(
      (policy) =>
        policy.actorAgentId === actorAgentId && policy.hostId === hostId,
    );

  async function validate(
    project: ProjectAdmission,
    policy: LocalProjectPolicy,
  ) {
    let checkout: string;
    try {
      checkout = await realpath(project.checkoutPath);
    } catch {
      return fail('PROJECT_REPOSITORY_INVALID');
    }
    let admitted = false;
    for (const allowed of policy.allowedRoots) {
      try {
        if (
          within(await realpath(allowed), checkout) &&
          within(resolve(allowed), resolve(project.checkoutPath))
        )
          admitted = true;
      } catch {
        /* An unavailable grant admits nothing. */
      }
    }
    if (!admitted) fail('PROJECT_ROOT_UNAUTHORIZED');
    if (checkout !== resolve(project.checkoutPath))
      fail('PROJECT_REPOSITORY_INVALID');
    try {
      const result = await exec(
        'git',
        ['-C', checkout, 'rev-parse', '--show-toplevel'],
        { timeout: 5000, maxBuffer: 8192 },
      );
      if ((await realpath(result.stdout.trim())) !== checkout)
        fail('PROJECT_REPOSITORY_INVALID');
    } catch {
      fail('PROJECT_REPOSITORY_INVALID');
    }
    try {
      const result = await exec(
        'git',
        [
          '-C',
          checkout,
          'rev-parse',
          '--verify',
          `${project.baseRevision}^{commit}`,
        ],
        { timeout: 5000, maxBuffer: 8192 },
      );
      if (result.stdout.trim() !== project.baseRevision)
        fail('PROJECT_REVISION_INVALID');
    } catch {
      fail('PROJECT_REVISION_INVALID');
    }
    let source: string;
    try {
      source = await realpath(project.sourceRoot);
      if (!(await lstat(source)).isDirectory()) fail('PROJECT_SOURCE_MISSING');
    } catch {
      return fail('PROJECT_SOURCE_MISSING');
    }
    if (
      !within(checkout, source) ||
      !within(checkout, resolve(project.sourceRoot)) ||
      source !== resolve(project.sourceRoot)
    )
      fail('PROJECT_SOURCE_OUTSIDE_ROOT');
  }

  function existing(project: ProjectAdmission) {
    return registrations.find(
      (item) =>
        item.project.hostId === project.hostId &&
        item.project.repositoryId === project.repositoryId,
    );
  }
  function install(registration: Registration, policy: LocalProjectPolicy) {
    const previous = existing(registration.project);
    if (previous) {
      if (hash(previous) !== hash(registration))
        fail('PROJECT_IDENTITY_CONFLICT');
      return;
    }
    const project = registration.project;
    if (
      repositories.some(
        (item) =>
          item.hostId === project.hostId &&
          item.repositoryId === project.repositoryId,
      )
    )
      fail('PROJECT_IDENTITY_CONFLICT');
    registrations.push(registration);
    repositories.push({
      hostId: project.hostId,
      repositoryId: project.repositoryId,
      checkoutPath: project.checkoutPath,
      leaseRoot: policy.leaseRoot,
    });
    workflowSources.push({
      projectScoped: true,
      actorAgentId: registration.actorAgentId,
      hostId: project.hostId,
      repositoryId: project.repositoryId,
      assignmentId: project.assignmentId,
      baseRevision: project.baseRevision,
      sourceRoot: project.sourceRoot,
      runtimeProfile: policy.runtimeProfile,
    });
  }

  for (const registryRoot of new Set(
    policies.map((policy) => policy.registryRoot),
  )) {
    let names: string[];
    try {
      names = await readdir(registryRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return fail('PROJECT_STORAGE_UNSAFE');
    }
    await ownerDirectory(registryRoot);
    if (names.length > 1000) fail('PROJECT_STORAGE_LIMIT');
    for (const name of names
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .sort()) {
      const path = join(registryRoot, name);
      const metadata = await lstat(path);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size > 32_768 ||
        (metadata.mode & 0o077) !== 0
      )
        fail('PROJECT_STORAGE_UNSAFE');
      const stored = record(JSON.parse(await readFile(path, 'utf8')));
      if (
        Object.keys(stored).length !== 2 ||
        typeof stored.actorAgentId !== 'string'
      )
        fail('PROJECT_STORAGE_UNSAFE');
      const project = parseProject(stored.project);
      const policy = policyFor(stored.actorAgentId, project.hostId);
      if (!policy || policy.registryRoot !== registryRoot) continue;
      if (name !== `${hash([project.hostId, project.repositoryId])}.json`)
        fail('PROJECT_STORAGE_UNSAFE');
      await validate(project, policy);
      install({ actorAgentId: stored.actorAgentId, project }, policy);
    }
  }

  return {
    repositories,
    workflowSources,
    async validateSource(value: unknown, authorization: ControlAuthorization) {
      const command = record(value);
      const matches = workflowSources.filter(
        (source) =>
          source.actorAgentId === authorization.actorAgentId &&
          (command.hostId === undefined || source.hostId === command.hostId) &&
          (command.repositoryId === undefined ||
            source.repositoryId === command.repositoryId),
      );
      if (matches.length !== 1) return;
      const registration = registrations.find(
        (item) =>
          item.project.hostId === matches[0].hostId &&
          item.project.repositoryId === matches[0].repositoryId,
      );
      if (!registration) return;
      const policy = policyFor(
        authorization.actorAgentId,
        registration.project.hostId,
      );
      if (!policy || !authorization.scopes.includes('control:workflow'))
        fail('PROJECT_ADMISSION_UNAUTHORIZED');
      await validate(registration.project, policy);
    },
    async admitProject(value: unknown, authorization: ControlAuthorization) {
      if (
        !authorization.actorAgentId ||
        !authorization.scopes.includes('control:project')
      )
        fail('PROJECT_ADMISSION_UNAUTHORIZED');
      const project = parseProject(value);
      const policy = policyFor(authorization.actorAgentId, project.hostId);
      if (!policy) return fail('PROJECT_ADMISSION_UNAUTHORIZED');
      await validate(project, policy);
      const registration = {
        actorAgentId: authorization.actorAgentId,
        project,
      };
      const previous = existing(project);
      if (
        (previous && hash(previous) !== hash(registration)) ||
        (!previous &&
          repositories.some(
            (item) =>
              item.hostId === project.hostId &&
              item.repositoryId === project.repositoryId,
          ))
      )
        fail('PROJECT_IDENTITY_CONFLICT');
      await ownerDirectory(policy.leaseRoot);
      await ownerDirectory(policy.registryRoot);
      if (!previous && (await readdir(policy.registryRoot)).length >= 1000)
        fail('PROJECT_STORAGE_LIMIT');
      const path = join(
        policy.registryRoot,
        `${hash([project.hostId, project.repositoryId])}.json`,
      );
      const temporary = join(policy.registryRoot, `.${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(JSON.stringify(registration));
          await file.sync();
        } finally {
          await file.close();
        }
        try {
          await link(temporary, path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            return fail('PROJECT_STORAGE_UNSAFE');
          const metadata = await lstat(path);
          if (
            !metadata.isFile() ||
            metadata.isSymbolicLink() ||
            metadata.size > 32_768 ||
            (metadata.mode & 0o077) !== 0
          )
            fail('PROJECT_STORAGE_UNSAFE');
          if (
            hash(JSON.parse(await readFile(path, 'utf8'))) !==
            hash(registration)
          )
            fail('PROJECT_IDENTITY_CONFLICT');
        }
      } finally {
        await unlink(temporary);
      }
      install(registration, policy);
      return {
        hostId: project.hostId,
        repositoryId: project.repositoryId,
        assignmentId: project.assignmentId,
        baseRevision: project.baseRevision,
        sourceRoot: project.sourceRoot,
        workspaceCustody: 'committed-revision-only',
      };
    },
    async authorizeCommand(
      value: unknown,
      authorization: ControlAuthorization,
    ) {
      const command = record(value);
      const workspace = record(command.workspace);
      const registration = registrations.find(
        (item) =>
          item.project.hostId === command.hostId &&
          item.project.repositoryId === workspace.repositoryId,
      );
      if (!registration) {
        if (
          !repositories.some(
            (item) =>
              item.hostId === command.hostId &&
              item.repositoryId === workspace.repositoryId,
          )
        )
          fail('WORKFLOW_CONTEXT_MISSING');
        return value;
      }
      if (
        typeof command.idempotencyKey !== 'string' ||
        !ID.test(command.idempotencyKey)
      )
        fail('PROJECT_ADMISSION_INVALID');
      if (registration.actorAgentId !== authorization.actorAgentId)
        fail('PROJECT_ADMISSION_UNAUTHORIZED');
      const policy = policyFor(
        authorization.actorAgentId,
        registration.project.hostId,
      );
      if (!policy) return fail('PROJECT_ADMISSION_UNAUTHORIZED');
      await validate(registration.project, policy);
      const runtimeProfile = record(command.runtimeProfile);
      const sandboxRanks: Record<string, number> = {
        readOnly: 0,
        'read-only': 0,
        workspaceWrite: 1,
        'workspace-write': 1,
        dangerFullAccess: 2,
        'danger-full-access': 2,
      };
      const requestedSandbox =
        typeof runtimeProfile.sandbox === 'string' &&
        Object.hasOwn(sandboxRanks, runtimeProfile.sandbox)
          ? sandboxRanks[runtimeProfile.sandbox]
          : undefined;
      if (
        requestedSandbox === undefined ||
        requestedSandbox > sandboxRanks[policy.runtimeProfile.sandbox] ||
        runtimeProfile.approvalPolicy !== 'never' ||
        (runtimeProfile.networkAccess !== undefined &&
          typeof runtimeProfile.networkAccess !== 'boolean')
      )
        fail('PROJECT_ADMISSION_UNAUTHORIZED');
      if (workspace.baseRevision !== registration.project.baseRevision)
        fail('PROJECT_REVISION_INVALID');
      return {
        ...command,
        idempotencyKey: `project:${hash([authorization.actorAgentId, command.hostId, workspace.repositoryId, command.idempotencyKey])}`,
      };
    },
  };
}
