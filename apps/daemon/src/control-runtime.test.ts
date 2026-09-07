import { describe, expect, it } from 'vitest';

import * as daemon from './main.js';

describe('[L1:INTEGRATION] CAS-09.R2 production composition', () => {
  const config = {
    hosts: [
      {
        hostId: 'local',
        transport: 'local-proxy',
        expectedVersion: '0.151.0',
      },
    ],
    repositories: [
      {
        hostId: 'local',
        repositoryId: 'codex',
        checkoutPath: '/srv/codex',
        leaseRoot: '/srv/leases',
      },
    ],
    workflows: [
      { workflowRef: 'trusted.workflow', modulePath: '/srv/workflow.mjs' },
    ],
    viewer: {
      host: '127.0.0.1',
      port: 4765,
      tokenFile: '/run/secrets/codex-control',
      uiDirectory: '/srv/codex-control-ui',
    },
  };

  it('strictly admits one production runtime configuration', () => {
    const parse = (daemon as Record<string, unknown>)[
      'parseProductionControlConfig'
    ] as ((value: unknown) => unknown) | undefined;
    expect(parse).toBeTypeOf('function');
    if (!parse) throw new Error('CONTROL_CONFIG_PARSER_MISSING');
    expect(parse(config)).toMatchObject({
      viewer: { host: '127.0.0.1', port: 4765 },
    });
    expect(() => parse({ ...config, publicHost: '0.0.0.0' })).toThrow(
      'CONTROL_CONFIG_INVALID',
    );
    expect(() =>
      parse({
        ...config,
        viewer: { ...config.viewer, host: '0.0.0.0' },
      }),
    ).toThrow('CONTROL_CONFIG_INVALID');
  });

  it('exports one production runtime that owns the loopback control resource', () => {
    expect(
      (daemon as Record<string, unknown>)['createProductionControlRuntime'],
    ).toBeTypeOf('function');
  });
});
