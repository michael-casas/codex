import { describe, expect, it } from 'vitest';
import { createControlVisibilityProjector } from '../../visibility/control-visibility.projector.js';
// === L1: UNIT TESTS ===
describe('[L1:UNIT] MEADOW safe diagnostic visibility', () => {
  it('MEADOW-L1-DIAGNOSTIC displays setup and cleanup separately without changing terminal outcome', () => {
    const project = createControlVisibilityProjector();
    const source = (
      n: number,
      kind: string,
      payload: Record<string, unknown> = {},
    ) => ({
      sequence: String(n),
      eventId: `e-${n}`,
      streamId: `workflow:workflow_${'a'.repeat(64)}`,
      kind,
      payload,
      occurredAt: '2026-09-08T00:00:00Z',
    });
    project(source(1, 'workflow.accepted'));
    const setup = project(
      source(2, 'workflow.execution.error', {
        attempt: 1,
        stage: 'acquire',
        code: 'LEASE_OWNERSHIP_MISMATCH',
        message: '/private secret',
      }),
    );
    expect(setup).toHaveLength(1);
    expect(setup[0].errorText).toContain('LEASE_OWNERSHIP_MISMATCH');
    expect(setup[0].errorText).not.toMatch(/private|secret/);
    project(source(3, 'workflow.cancelled'));
    const cleanup = project(
      source(4, 'workflow.cleanup.error', {
        attempt: 1,
        stage: 'release',
        code: 'PROVIDER_FAILURE',
      }),
    );
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].status).toBe('cancelled');
    expect(cleanup[0].errorText).toContain('release');
  });
});
// === L1: IN-PROCESS INTEGRATION TESTS ===
