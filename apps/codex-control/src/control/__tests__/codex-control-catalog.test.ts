import { describe, expect, it } from 'vitest';
import { codexControlToolCatalog } from '../codex-control.gateway.js';

describe('[L1:UNIT] codex-control tool contract', () => {
  it('publishes the one-call task API with accurate safety annotations', () => {
    expect(codexControlToolCatalog).toEqual([
      { name: 'delegate_agent', readOnly: false, destructive: false },
      { name: 'send_agent_message', readOnly: false, destructive: false },
      { name: 'ask_agent', readOnly: false, destructive: false },
      { name: 'reply_agent', readOnly: false, destructive: false },
      { name: 'run_workflow', readOnly: false, destructive: false },
      { name: 'cancel_agent', readOnly: false, destructive: true },
      { name: 'cancel_workflow', readOnly: false, destructive: true },
      { name: 'get_control_snapshot', readOnly: true, destructive: false },
      { name: 'wait_control_delta', readOnly: true, destructive: false },
    ]);
  });
});
