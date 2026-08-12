import { describe, expect, test } from 'vitest';

import {
  evaluateSdkImportExclusivity,
  scanSdkImportsInSource,
} from './sdk-imports.js';

// === L1: UNIT TESTS ===

const allowed = 'packages/codex/src/runtime/adapter.ts';

describe('[L1:UNIT] Codex SDK import exclusivity policy', () => {
  test.each([
    ['static value import', "import { Codex } from '@openai/codex-sdk'"],
    [
      'static type import',
      "import type { CodexOptions } from '@openai/codex-sdk'",
    ],
    ['side-effect import', "import '@openai/codex-sdk'"],
    ['re-export', "export { Codex } from '@openai/codex-sdk'"],
    ['dynamic import', "const sdk = import('@openai/codex-sdk')"],
    ['CommonJS require', "const sdk = require('@openai/codex-sdk')"],
  ])('[L1:UNIT] CWF-AUD-005 detects a %s', (_case, source) => {
    expect(scanSdkImportsInSource('fixture.ts', source)).toHaveLength(1);
  });

  test('[L1:UNIT] CWF-AUD-005 ignores comments and ordinary strings', () => {
    const source = [
      "// import '@openai/codex-sdk'",
      'const example = "from \'@openai/codex-sdk\'"',
      'const dynamicExample = "import(\'@openai/codex-sdk\')"',
      "/* require('@openai/codex-sdk') */",
    ].join('\n');
    expect(scanSdkImportsInSource('fixture.ts', source)).toEqual([]);
  });

  test('[L1:UNIT] CWF-AUD-005 requires exactly one allowed occurrence', () => {
    const valid = evaluateSdkImportExclusivity(
      [{ path: allowed, source: "import { Codex } from '@openai/codex-sdk'" }],
      allowed,
    );
    const missing = evaluateSdkImportExclusivity(
      [{ path: allowed, source: 'export const adapter = true' }],
      allowed,
    );
    const duplicate = evaluateSdkImportExclusivity(
      [
        {
          path: allowed,
          source: [
            "import { Codex } from '@openai/codex-sdk'",
            "import type { CodexOptions } from '@openai/codex-sdk'",
          ].join('\n'),
        },
      ],
      allowed,
    );
    const forbidden = evaluateSdkImportExclusivity(
      [
        {
          path: allowed,
          source: "import { Codex } from '@openai/codex-sdk'",
        },
        {
          path: 'apps/forbidden.ts',
          source: "import '@openai/codex-sdk'",
        },
      ],
      allowed,
    );

    expect(valid).toMatchObject({
      allowedOccurrences: 1,
      selected: 1,
      status: 'passed',
    });
    expect(missing).toMatchObject({
      allowedOccurrences: 0,
      selected: 0,
      status: 'failed',
    });
    expect(duplicate).toMatchObject({
      allowedOccurrences: 2,
      selected: 2,
      status: 'failed',
    });
    expect(forbidden).toMatchObject({
      offenders: ['apps/forbidden.ts'],
      selected: 2,
      status: 'failed',
    });
  });
});
