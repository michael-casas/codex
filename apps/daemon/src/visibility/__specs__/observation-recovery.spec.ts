import { expect, it } from 'vitest';
import {
  observationRecoveryScenario,
  serializationScenario,
} from '../support/observation-recovery.driver.js';
// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
it('[L2:INTEGRATION] OBS-L2-HTTP always sends safe valid JSON for snapshot serialization and wait failures', async () => {
  expect(await serializationScenario()).toEqual({
    snapshot: { status: 500, body: { code: 'CONTROL_OPERATION_FAILED' } },
    wait: { status: 500, body: { code: 'CONTROL_OPERATION_FAILED' } },
  });
});
// === L2: END-TO-END TESTS ===
it('[L2:E2E] OBS-L2-RECOVERY recovers public observation with real PostgreSQL listener and immutable history', async () => {
  expect(await observationRecoveryScenario()).toEqual({
    degradedStatus: 500,
    degradedCode: 'VISIBILITY_OBSERVER_UNAVAILABLE',
    terminal: true,
    historyPreserved: true,
    replayTerminal: true,
    eventCount: 2,
    sourceCount: 2,
  });
}, 15_000);
it('[L2:INTEGRATION] OBS-L2-INTERRUPTED classifies an interrupted binding over real stdio without a new agent', async () => {
  const { interruptedBindingScenario } = await import(
    '../support/observation-recovery.driver.js'
  );
  expect(await interruptedBindingScenario()).toEqual({
    code: 'WORKFLOW_TURN_INTERRUPTED',
    retryable: false,
    ambiguous: false,
    starts: 0,
    reads: 1,
    childExited: true,
    pendingRequests: 0,
  });
});
it('[L2:E2E] R5-L2-LONG bounds duplicate ingestion and retains a real SQL constraint failure', async () => {
  const { longObservationScenario } = await import(
    '../support/observation-recovery.driver.js'
  );
  const result = await longObservationScenario();
  expect(result).toMatchObject({
    duplicateWrites: 0,
    terminal: true,
    eventCount: 2101,
    failedStatus: 500,
    publicError: { code: 'VISIBILITY_OBSERVER_FAILED' },
    failure: {
      state: 'failed',
      cursor: '2101',
      recoveryAttempts: 0,
      lastFailure: {
        causeCode: '23514',
        errorClass: 'DatabaseError',
        sourceCursor: '2102',
        sourceEventId: result.sourceId,
      },
    },
  });
  expect(JSON.stringify(result.failure)).not.toMatch(/private|credentials/);
}, 60_000);
