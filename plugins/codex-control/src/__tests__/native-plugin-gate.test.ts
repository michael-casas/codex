import { describe, expect, it, vi } from 'vitest';

import {
  assertReadOnlyToolCalls,
  buildDockerRunArguments,
  parseNativeGateOptions,
  withOwnedContainerCleanup,
} from '../../scripts/native-plugin-gate-lib.js';

describe('[L1:UNIT] native plugin clean-install gate', () => {
  it('defaults to credential-free smoke and validates opt-in prerequisites', () => {
    expect(parseNativeGateOptions([], {})).toMatchObject({
      mode: 'smoke',
      image: 'cas-nextjs-dogfood-app-server:latest',
      backendPort: 4765,
      rpcTimeoutMs: 15_000,
      turnTimeoutMs: 120_000,
    });
    expect(() => parseNativeGateOptions(['--live'], {})).toThrow(
      'LIVE_TOKEN_FILE_REQUIRED',
    );
    expect(() =>
      parseNativeGateOptions(['--paid-agent'], {
        CAS_NATIVE_PLUGIN_TOKEN_FILE: '/tmp/token',
      }),
    ).toThrow('PAID_AUTH_FILE_REQUIRED');
  });

  it('rejects every extra, mutating, failed, or wrong-server tool call', () => {
    expect(() =>
      assertReadOnlyToolCalls([
        {
          server: 'codex-control',
          tool: 'get_control_snapshot',
          status: 'completed',
        },
      ]),
    ).not.toThrow();
    for (const call of [
      { server: 'codex-control', tool: 'cancel_agent', status: 'completed' },
      { server: 'other', tool: 'get_control_snapshot', status: 'completed' },
      {
        server: 'codex-control',
        tool: 'get_control_snapshot',
        status: 'failed',
      },
    ]) {
      expect(() => assertReadOnlyToolCalls([call])).toThrow(
        'READ_ONLY_TOOL_ALLOWLIST_VIOLATION',
      );
    }
    expect(() =>
      assertReadOnlyToolCalls([
        {
          server: 'codex-control',
          tool: 'get_control_snapshot',
          status: 'completed',
        },
        {
          server: 'codex-control',
          tool: 'wait_control_delta',
          status: 'completed',
        },
      ]),
    ).toThrow('READ_ONLY_TOOL_ALLOWLIST_VIOLATION');
  });

  it('constructs an isolated built-only Docker consumer', () => {
    const options = parseNativeGateOptions([], {});
    const args = buildDockerRunArguments(options, {
      containerName: 'cas-native-plugin-gate-test',
      marketplaceRoot: '/tmp/market',
      harnessRoot: '/tmp/harness',
    });
    expect(args).toEqual(
      expect.arrayContaining([
        'run',
        '--rm',
        '--read-only',
        '--network',
        'none',
        '--name',
        'cas-native-plugin-gate-test',
        'cas-nextjs-dogfood-app-server:latest',
      ]),
    );
    expect(args.join(' ')).not.toContain('node_modules');
    expect(args.join(' ')).not.toContain('/src');
  });

  it('cleans the exact owned container after an early failure', async () => {
    const cleanup = vi.fn(async () => undefined);
    await expect(
      withOwnedContainerCleanup(async () => {
        throw new Error('CONTROLLED_GATE_FAILURE');
      }, cleanup),
    ).rejects.toThrow('CONTROLLED_GATE_FAILURE');
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
