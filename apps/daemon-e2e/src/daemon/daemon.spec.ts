import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] daemon scaffold process boundary', () => {
  it('should print a message', () => {
    const cliPath = join(process.cwd(), 'apps/daemon/dist/main.js');

    const output = execFileSync(process.execPath, [cliPath], {
      encoding: 'utf8',
    });

    expect(output).toMatch(/Hello World/);
  });
});
