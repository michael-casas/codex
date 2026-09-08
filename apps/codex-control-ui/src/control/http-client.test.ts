import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserControlClient } from './http-client';

// === L1: UNIT TESTS ===
describe('[L1:UNIT] CAS-09.R2 browser control client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps tools to same-origin bounded read endpoints', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ cursor: '1', changed: false })),
    );
    vi.stubGlobal('fetch', fetch);
    const client = createBrowserControlClient('http://127.0.0.1:4765');

    await client.callTool('get_control_snapshot', {
      selectedAgentId: 'agent-1',
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL(
        'http://127.0.0.1:4765/api/control/snapshot?selectedAgentId=agent-1',
      ),
      { signal: undefined },
    );
  });
});
