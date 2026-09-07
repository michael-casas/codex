import { describe, expect, it } from 'vitest';

import {
  createPresentationDescriptor,
  parseControlRoute,
} from './presentation';

describe('[L1:UNIT] CAS-10 presentation contract', () => {
  it('creates one secret-free local, MCP Apps, and mobile descriptor', () => {
    expect(
      createPresentationDescriptor('workflow', 'workflow-42', {
        mobileBaseUrl: 'https://control.example.ts.net',
        mobileAccess: 'tailnet',
      }),
    ).toEqual({
      id: 'workflow-42',
      kind: 'workflow',
      localPath: '/workflows/workflow-42',
      mcpAppsResourceUri: 'ui://codex-control/v1.html',
      mobile: {
        state: 'available',
        url: 'https://control.example.ts.net/workflows/workflow-42',
        access: 'tailnet',
        readOnly: true,
      },
    });
    expect(parseControlRoute('/agents/agent-ada')).toEqual({
      kind: 'agent',
      id: 'agent-ada',
    });
  });

  it.each([
    ['workflow', '../secret', {}, 'PRESENTATION_ID_INVALID'],
    [
      'agent',
      'agent-ada',
      { mobileBaseUrl: 'http://public.example.test' },
      'PRESENTATION_MOBILE_URL_INVALID',
    ],
    [
      'agent',
      'agent-ada',
      { mobileBaseUrl: 'https://token:secret@control.example.test' },
      'PRESENTATION_MOBILE_URL_INVALID',
    ],
    [
      'agent',
      'agent-ada',
      { mobileBaseUrl: 'wss://remote.example.test' },
      'PRESENTATION_MOBILE_URL_INVALID',
    ],
  ] as const)('rejects unsafe descriptors', (kind, id, options, code) => {
    expect(() => createPresentationDescriptor(kind, id, options)).toThrow(code);
  });
});
