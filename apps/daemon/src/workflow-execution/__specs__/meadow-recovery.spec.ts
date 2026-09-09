import { describe, it, expect } from 'vitest';
import {
  meadowLeaseScenario,
  meadowMessagingScenario,
} from '../support/meadow-recovery.driver.js';
// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] MEADOW recovery', () => {
  it('MEADOW-L2-LEASE isolates runs, recovers retained owned leases and preserves foreign custody', async () => {
    expect(await meadowLeaseScenario()).toEqual({
      isolated: true,
      recovered: true,
      foreignPreserved: true,
    });
  }, 30000);
});
// === L2: END-TO-END TESTS ===
describe('[L2:E2E] MEADOW coordinator messaging', () => {
  it('MEADOW-L2-MESSAGE admits ownership, rejects foreign and historical recipients and delivers once through pg-boss', async () => {
    expect(await meadowMessagingScenario()).toEqual({
      ownedDelivered: true,
      foreignDenied: true,
      replayDeduplicated: true,
    });
  }, 30000);
});
