import { describe, expect, it } from 'vitest';

import { prepareWorkflowRun } from './run-workflow.js';

const command = () =>
  ({
    workflowRef: 'trusted.research-implementation',
    sourceDigest: `sha256:${'a'.repeat(64)}`,
    input: { topic: 'App Server' },
    hostId: 'remote-controlled',
    workspace: {
      repositoryId: 'codex',
      baseRevision: 'b'.repeat(40),
      assignmentId: 'CAS-07',
    },
    runtimeProfile: {
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      sandbox: 'workspaceWrite',
      approvalPolicy: 'never',
    },
    idempotencyKey: 'cas07-run-1',
  }) as const;

// === L1: UNIT TESTS ===
describe('[L1:UNIT] run_workflow command', () => {
  it('creates one stable run identity for exact replay and fingerprints conflicts', () => {
    const first = prepareWorkflowRun(command());
    expect(prepareWorkflowRun(command())).toEqual(first);
    const conflict = prepareWorkflowRun({
      ...command(),
      input: { topic: 'different' },
    });
    expect(conflict.runId).toBe(first.runId);
    expect(conflict.requestFingerprint).not.toBe(first.requestFingerprint);
  });

  it('rejects raw paths, extra choreography, wrong effort, and non-JSON input', () => {
    expect(() =>
      prepareWorkflowRun({ ...command(), rawPath: '/tmp/escape' }),
    ).toThrowError(/Invalid run_workflow/);
    expect(() =>
      prepareWorkflowRun({
        ...command(),
        runtimeProfile: {
          ...command().runtimeProfile,
          reasoningEffort: 'high effort',
        },
      }),
    ).toThrowError(/Invalid run_workflow/);
    expect(() => prepareWorkflowRun({ ...command(), input: 1n })).toThrowError(
      /JSON serializable/,
    );
  });
});
