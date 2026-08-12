import { describe, expect, test } from 'vitest';

import {
  canonicalizeJson,
  normalizeWorkflow,
  parseLegacyPi,
  planWorkflow,
  WorkflowValidationError,
  type WorkflowSource,
  type WorkflowStep,
  type JsonValue,
} from '../index.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===

const policy: WorkflowSource['policy'] = {
  maxConcurrentSteps: 4,
  maxAttempts: 2,
  sandbox: 'read-only',
  approval: 'never',
  network: 'disabled',
  allowedRoots: ['.'],
  allowedModels: ['gpt-5.1-codex'],
};

function source(
  steps: WorkflowStep[],
  inputSchema: WorkflowSource['inputSchema'] = { type: 'object' },
): WorkflowSource {
  return {
    schemaVersion: 1,
    id: 'repair-fixture',
    version: 1,
    inputSchema,
    policy: { ...policy },
    steps,
  };
}

describe('[L1:INTEGRATION] workflow self-audit repair contract', () => {
  test('[L1:INTEGRATION] CWF-AUD-002 isolates and deeply freezes every nested plan projection from digest-bound state', () => {
    const child: WorkflowSource = {
      ...source([
        {
          id: 'child-task',
          kind: 'task',
          handler: { type: 'registered', name: 'identity' },
        },
      ]),
      id: 'repair-child',
    };
    const workflow = normalizeWorkflow(
      source(
        [
          {
            id: 'optional',
            kind: 'task',
            condition: {
              pointer: '/enabled',
              operator: 'equals',
              value: true,
            },
            handler: { type: 'registered', name: 'identity' },
          },
          {
            id: 'fan',
            kind: 'fan-out',
            from: '/records',
            itemKey: '/id',
            maxItems: 4,
            concurrency: 2,
            handler: { type: 'registered', name: 'collect' },
          },
          {
            id: 'joined',
            kind: 'join',
            dependsOn: ['optional', 'fan'],
            mode: 'all',
          },
          {
            id: 'child',
            kind: 'subworkflow',
            dependsOn: ['joined'],
            workflow: child,
          },
          {
            id: 'artifact',
            kind: 'artifact',
            dependsOn: ['child'],
            sourceStep: 'child',
            mediaType: 'application/json',
            redaction: 'internal',
            retention: 'campaign',
          },
        ],
        {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            records: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
          },
          required: ['enabled', 'records'],
        },
      ),
    );
    const input = { enabled: false, records: [{ id: 'record-1' }] };
    const canonicalBefore = workflow.canonicalJson;
    const digestBefore = workflow.digest;
    const first = planWorkflow(workflow, input);
    const firstBytes = canonicalizeJson(first as unknown as JsonValue);
    const firstNode = first.nodes[0];
    const fan = first.nodes.find((node) => node.id === 'fan[record-1]');
    const joined = first.nodes.find((node) => node.id === 'joined');
    const artifact = first.nodes.find((node) => node.id === 'artifact');
    if (!firstNode || !fan || !joined || !artifact?.artifact)
      throw new Error('repair fixture did not produce its required nodes');

    expect(Reflect.set(first.policy, 'maxAttempts', 9)).toBe(false);
    expect(() => first.policy.allowedRoots.push('/mutated')).toThrow(TypeError);
    expect(() => first.requiredCapabilities.push('codex:mutated')).toThrow(
      TypeError,
    );
    expect(() => first.nodes.push({ ...firstNode, id: 'mutated' })).toThrow(
      TypeError,
    );
    expect(() => first.warnings.push('mutated')).toThrow(TypeError);
    expect(() => fan.capabilityRequest.push('handler:mutated')).toThrow(
      TypeError,
    );
    expect(() => fan.policyRequest.allowedModels.push('mutated')).toThrow(
      TypeError,
    );
    expect(() => joined.dependsOn.push('mutated')).toThrow(TypeError);
    expect(Reflect.set(firstNode, 'status', 'ready')).toBe(false);
    expect(Reflect.set(artifact.artifact, 'redaction', 'public')).toBe(false);

    const second = planWorkflow(workflow, input);
    expect(canonicalizeJson(first as unknown as JsonValue)).toBe(firstBytes);
    expect(second).toEqual(first);
    expect(workflow.canonicalJson).toBe(canonicalBefore);
    expect(canonicalizeJson(workflow.definition as unknown as JsonValue)).toBe(
      canonicalBefore,
    );
    expect(workflow.digest).toBe(digestBefore);
  });

  test('[L1:INTEGRATION] SA-001 rejects a conditional branch without a reachable explicit join', () => {
    const workflow = source(
      [
        {
          id: 'conditional',
          kind: 'task',
          condition: {
            pointer: '/enabled',
            operator: 'equals',
            value: true,
          },
          handler: { type: 'registered', name: 'identity' },
        },
        {
          id: 'after',
          kind: 'task',
          dependsOn: ['conditional'],
          handler: { type: 'registered', name: 'identity' },
        },
      ],
      {
        type: 'object',
        properties: { enabled: { type: 'boolean' } },
        required: ['enabled'],
      },
    );

    expect(() => normalizeWorkflow(workflow)).toThrowError(
      expect.objectContaining<Partial<WorkflowValidationError>>({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'CONDITIONAL_JOIN_REQUIRED' }),
        ]),
      }),
    );
  });

  test('[L1:INTEGRATION] SA-002 binds redacted handler, capability, and policy requests to every planned node', () => {
    const workflow = normalizeWorkflow(
      source([
        {
          id: 'prepare',
          kind: 'task',
          handler: { type: 'registered', name: 'identity' },
        },
        {
          id: 'review',
          kind: 'task',
          dependsOn: ['prepare'],
          handler: {
            type: 'codex',
            model: 'gpt-5.1-codex',
            prompt: 'sensitive prompt that must not enter the plan',
          },
        },
        {
          id: 'joined',
          kind: 'join',
          dependsOn: ['review'],
          mode: 'all',
        },
      ]),
    );
    const plan = planWorkflow(workflow, {});
    const prepare = plan.nodes.find((node) => node.id === 'prepare');
    const review = plan.nodes.find((node) => node.id === 'review');
    const joined = plan.nodes.find((node) => node.id === 'joined');

    expect(prepare).toEqual(
      expect.objectContaining({
        capabilityRequest: ['handler:identity'],
        handlerRequest: { type: 'registered', name: 'identity' },
        policyRequest: policy,
      }),
    );
    expect(review).toEqual(
      expect.objectContaining({
        capabilityRequest: ['codex:gpt-5.1-codex'],
        handlerRequest: {
          type: 'codex',
          model: 'gpt-5.1-codex',
          promptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        },
        policyRequest: policy,
      }),
    );
    expect(joined).toEqual(
      expect.objectContaining({
        capabilityRequest: [],
        policyRequest: policy,
      }),
    );
    expect(prepare?.policyRequest).not.toBe(workflow.definition.policy);
    expect(JSON.stringify(plan)).not.toContain(
      'sensitive prompt that must not enter the plan',
    );
  });

  test('[L1:INTEGRATION] SA-003 rejects aggregate fan-out expansion beyond the plan node ceiling', () => {
    const fanOuts: WorkflowStep[] = Array.from({ length: 5 }, (_, index) => ({
      id: `fan-${index}`,
      kind: 'fan-out',
      from: '/records',
      itemKey: '/id',
      maxItems: 1_024,
      concurrency: 1,
      handler: { type: 'registered', name: 'identity' },
    }));
    const workflow = normalizeWorkflow(
      source(fanOuts, {
        type: 'object',
        properties: {
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'integer' } },
              required: ['id'],
            },
          },
        },
        required: ['records'],
      }),
    );

    expect(() =>
      planWorkflow(workflow, {
        records: Array.from({ length: 1_024 }, (_, id) => ({ id })),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkflowValidationError>>({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'PLAN_NODE_LIMIT_EXCEEDED' }),
        ]),
      }),
    );
  });

  test('[L1:INTEGRATION] SA-003 bounds legacy historical-claim count and text without changing the source digest', () => {
    const longClaim = 'e'.repeat(5_000);
    const goal = {
      version: 3,
      id: 'bounded-goal',
      taskList: {
        blockCompletion: true,
        tasks: Array.from({ length: 260 }, (_, index) => ({
          id: `task-${index}`,
          evidence: longClaim,
        })),
      },
    };
    const bytes = new TextEncoder().encode(
      `${JSON.stringify(goal)}\n${'p'.repeat(5_000)}`,
    );
    const imported = parseLegacyPi(bytes);

    expect(imported.historicalClaims).toHaveLength(256);
    expect(
      imported.historicalClaims.every((claim) => claim.text.length <= 4_096),
    ).toBe(true);
    expect(imported.truncatedClaims).toBeGreaterThan(0);
    expect(imported.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
