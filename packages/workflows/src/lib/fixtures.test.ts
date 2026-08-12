import { describe, expect, test } from 'vitest';

import {
  normalizeWorkflow,
  planWorkflow,
  WorkflowValidationError,
  type WorkflowSource,
} from '../index.js';

// === L1: UNIT TESTS ===

function baseWorkflow(): WorkflowSource {
  return {
    schemaVersion: 1,
    id: 'contract-fixture',
    version: 1,
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    policy: {
      maxConcurrentSteps: 4,
      maxAttempts: 2,
      sandbox: 'read-only',
      approval: 'never',
      network: 'disabled',
      allowedRoots: ['.'],
      allowedModels: ['gpt-5.1-codex'],
    },
    steps: [
      {
        id: 'prepare',
        kind: 'task',
        handler: { type: 'registered', name: 'identity' },
      },
      {
        id: 'items',
        kind: 'fan-out',
        dependsOn: ['prepare'],
        from: '/items',
        itemKey: '/id',
        maxItems: 8,
        concurrency: 2,
        handler: { type: 'registered', name: 'identity' },
      },
      {
        id: 'done',
        kind: 'join',
        dependsOn: ['items'],
        mode: 'all',
      },
    ],
  };
}

function issueCodes(source: unknown): string[] {
  try {
    normalizeWorkflow(source);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowValidationError);
    return (error as WorkflowValidationError).issues.map((issue) => issue.code);
  }
}

describe('[L1:UNIT] workflow definition contract', () => {
  test.each([
    [
      'condition',
      (source: WorkflowSource) => {
        source.steps[0].condition = {
          pointer: '/invalid/~2escape',
          operator: 'exists',
        };
      },
    ],
    [
      'fan-out source',
      (source: WorkflowSource) => {
        const fanOut = source.steps[1];
        if (fanOut.kind === 'fan-out') fanOut.from = '/items/~';
      },
    ],
    [
      'fan-out item key',
      (source: WorkflowSource) => {
        const fanOut = source.steps[1];
        if (fanOut.kind === 'fan-out') fanOut.itemKey = '/~x';
      },
    ],
  ])(
    '[L1:UNIT] CWF-AUD-006 rejects malformed RFC 6901 escapes in a %s pointer',
    (_case, mutate) => {
      const source = baseWorkflow();
      mutate(source);
      expect(issueCodes(source)).toContain('UNSAFE_JSON_POINTER');
    },
  );

  test('[L1:UNIT] WF-L1-001 normalizes and hashes equivalent definitions deterministically', () => {
    const source = baseWorkflow();
    const reordered = JSON.parse(JSON.stringify(source)) as WorkflowSource;
    reordered.policy = {
      allowedModels: source.policy.allowedModels,
      allowedRoots: source.policy.allowedRoots,
      network: source.policy.network,
      approval: source.policy.approval,
      sandbox: source.policy.sandbox,
      maxAttempts: source.policy.maxAttempts,
      maxConcurrentSteps: source.policy.maxConcurrentSteps,
    };

    const first = normalizeWorkflow(source);
    const second = normalizeWorkflow(reordered);

    expect(first.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.digest).toBe(first.digest);
    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(first.definition.steps.map((step) => step.id)).toEqual([
      'prepare',
      'items',
      'done',
    ]);
  });

  test.each([
    [
      'DUPLICATE_STEP_ID',
      (source: WorkflowSource) => source.steps.push({ ...source.steps[0] }),
    ],
    [
      'MISSING_DEPENDENCY',
      (source: WorkflowSource) => {
        source.steps[1].dependsOn = ['absent'];
      },
    ],
    [
      'SELF_DEPENDENCY',
      (source: WorkflowSource) => {
        source.steps[1].dependsOn = ['items'];
      },
    ],
    [
      'DEPENDENCY_CYCLE',
      (source: WorkflowSource) => {
        source.steps[0].dependsOn = ['done'];
      },
    ],
    [
      'POLICY_CONCURRENCY_INVALID',
      (source: WorkflowSource) => {
        source.policy.maxConcurrentSteps = 0;
      },
    ],
    [
      'UNSAFE_JSON_POINTER',
      (source: WorkflowSource) => {
        const fanOut = source.steps[1];
        if (fanOut.kind === 'fan-out') fanOut.from = '/__proto__/items';
      },
    ],
    [
      'UNKNOWN_HANDLER',
      (source: WorkflowSource) => {
        const task = source.steps[0];
        if (task.kind === 'task')
          task.handler = { type: 'registered', name: 'shell' };
      },
    ],
    [
      'REMOTE_SCHEMA_REFERENCE',
      (source: WorkflowSource) => {
        source.inputSchema = { $ref: 'https://attacker.invalid/schema.json' };
      },
    ],
    [
      'UNSAFE_ALLOWED_ROOT',
      (source: WorkflowSource) => {
        source.policy.allowedRoots = ['../outside'];
      },
    ],
  ])('[L1:UNIT] WF-L1-002 rejects %s', (expectedCode, mutate) => {
    const source = baseWorkflow();
    mutate(source);
    expect(issueCodes(source)).toContain(expectedCode);
  });
});

// This call keeps the product planner import exercised by the RED harness without
// classifying this unit-owned file as an L1 integration suite.
void planWorkflow;
