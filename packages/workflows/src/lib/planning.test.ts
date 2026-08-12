import { describe, expect, test } from 'vitest';

import {
  normalizeWorkflow,
  planWorkflow,
  WorkflowValidationError,
  type WorkflowSource,
} from '../index.js';

// === L1: IN-PROCESS INTEGRATION TESTS ===

function planningWorkflow(): WorkflowSource {
  const child: WorkflowSource = {
    schemaVersion: 1,
    id: 'child',
    version: 1,
    inputSchema: { type: 'object' },
    policy: {
      maxConcurrentSteps: 1,
      maxAttempts: 1,
      sandbox: 'read-only',
      approval: 'never',
      network: 'disabled',
      allowedRoots: ['.'],
      allowedModels: ['gpt-5.1-codex'],
    },
    steps: [
      {
        id: 'child-task',
        kind: 'task',
        handler: { type: 'registered', name: 'identity' },
      },
    ],
  };
  return {
    schemaVersion: 1,
    id: 'planning-fixture',
    version: 2,
    inputSchema: {
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
        id: 'optional',
        kind: 'task',
        condition: { pointer: '/enabled', operator: 'equals', value: true },
        handler: { type: 'registered', name: 'identity' },
      },
      {
        id: 'review',
        kind: 'fan-out',
        from: '/records',
        itemKey: '/id',
        maxItems: 3,
        concurrency: 2,
        handler: { type: 'codex', prompt: 'Review the supplied record.' },
      },
      {
        id: 'join',
        kind: 'join',
        dependsOn: ['optional', 'review'],
        mode: 'all',
      },
      {
        id: 'child',
        kind: 'subworkflow',
        dependsOn: ['join'],
        workflow: child,
      },
      {
        id: 'report',
        kind: 'artifact',
        dependsOn: ['child'],
        sourceStep: 'child',
        mediaType: 'application/json',
        redaction: 'internal',
        retention: 'campaign',
      },
    ],
  };
}

describe('[L1:INTEGRATION] workflow planning contract', () => {
  test('[L1:INTEGRATION] WF-L1-003 plans fan-out, join, condition, child, and artifact deterministically', () => {
    const workflow = normalizeWorkflow(planningWorkflow());
    const input = {
      enabled: false,
      records: [{ id: 'z' }, { id: 'a' }],
    };
    const first = planWorkflow(workflow, input);
    const second = planWorkflow(workflow, input);

    expect(second).toEqual(first);
    expect(first.nodes.map((node) => node.id)).toEqual([
      'optional',
      'review[a]',
      'review[z]',
      'join',
      'child',
      'report',
    ]);
    expect(first.nodes[0]?.status).toBe('skipped');
    expect(
      first.nodes.find((node) => node.id === 'child')?.childDigest,
    ).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.nodes.find((node) => node.id === 'report')?.artifact).toEqual({
      sourceStep: 'child',
      mediaType: 'application/json',
      redaction: 'internal',
      retention: 'campaign',
    });
    expect(first.requiredCapabilities).toEqual([
      'artifact:application/json',
      'codex:gpt-5.1-codex',
      'handler:identity',
      'subworkflow',
    ]);
  });

  test('[L1:INTEGRATION] WF-L1-003 rejects duplicate fan-out item keys', () => {
    const workflow = normalizeWorkflow(planningWorkflow());
    expect(() =>
      planWorkflow(workflow, {
        enabled: true,
        records: [{ id: 'same' }, { id: 'same' }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkflowValidationError>>({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'DUPLICATE_FAN_OUT_KEY' }),
        ]),
      }),
    );
  });

  test('[L1:INTEGRATION] WF-L1-003 rejects fan-out expansion beyond the declared maximum', () => {
    const workflow = normalizeWorkflow(planningWorkflow());
    expect(() =>
      planWorkflow(workflow, {
        enabled: true,
        records: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WorkflowValidationError>>({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'FAN_OUT_LIMIT_EXCEEDED' }),
        ]),
      }),
    );
  });
});
