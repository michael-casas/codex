import { describe, expect, test } from 'vitest';

import { WorkflowValidationError } from '@codex/workflows';

import { CliError, mapCliError, parseCliArgs } from './cli.js';

// === L1: UNIT TESTS ===

describe('[L1:UNIT] codex-workflows CLI contract', () => {
  test('[L1:UNIT] CLI-L1-001 parses commands and flags without changing semantics for JSON output', () => {
    expect(
      parseCliArgs([
        'validate',
        'workflow.json',
        '--input',
        'input.json',
        '--json',
      ]),
    ).toEqual({
      command: 'validate',
      subject: 'workflow.json',
      inputPath: 'input.json',
      json: true,
    });
    expect(parseCliArgs(['status', 'run-123', '--json'])).toEqual({
      command: 'status',
      subject: 'run-123',
      json: true,
    });
  });

  test('[L1:UNIT] TS-GC2-012 parses bare TypeScript execution and additive inspection flags without changing explicit commands', () => {
    expect(
      parseCliArgs(['workflow.ts', '--input', 'input.json', '--json']),
    ).toEqual({
      command: 'run',
      subject: 'workflow.ts',
      inputPath: 'input.json',
      json: true,
    });
    expect(parseCliArgs(['workflow.ts', '--plan', '--json'])).toEqual({
      command: 'plan',
      subject: 'workflow.ts',
      json: true,
    });
    expect(parseCliArgs(['workflow.ts', '--dry-run', '--json'])).toEqual({
      command: 'dry-run',
      subject: 'workflow.ts',
      json: true,
    });
    expect(parseCliArgs(['run', 'workflow.ts', '--json'])).toEqual({
      command: 'run',
      subject: 'workflow.ts',
      json: true,
    });
  });

  test.each([
    [['plan', 'workflow.json'], 'MISSING_INPUT'],
    [['inspect'], 'MISSING_SUBJECT'],
    [['validate', 'workflow.json', '--unknown'], 'UNKNOWN_FLAG'],
    [['unknown', 'workflow.json'], 'UNKNOWN_COMMAND'],
  ])(
    '[L1:UNIT] CLI-L1-001 maps invalid argv %j to usage error %s',
    (argv, code) => {
      expect(() => parseCliArgs(argv)).toThrowError(
        expect.objectContaining<Partial<CliError>>({ exitCode: 64, code }),
      );
    },
  );

  test('[L1:UNIT] CLI-L1-001 maps data, I/O, unavailable, and internal errors to stable exits', () => {
    expect(
      mapCliError(
        new WorkflowValidationError([
          { code: 'DUPLICATE_STEP_ID', path: '/steps', message: 'duplicate' },
        ]),
      ),
    ).toEqual(
      expect.objectContaining({ code: 'WORKFLOW_INVALID', exitCode: 65 }),
    );
    expect(
      mapCliError(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    ).toEqual(
      expect.objectContaining({ code: 'SOURCE_NOT_READABLE', exitCode: 66 }),
    );
    expect(
      mapCliError(new CliError('CONTROL_PLANE_UNAVAILABLE', 69, 'unavailable')),
    ).toEqual(
      expect.objectContaining({
        code: 'CONTROL_PLANE_UNAVAILABLE',
        exitCode: 69,
      }),
    );
    expect(mapCliError(new Error('secret-bearing internal detail'))).toEqual(
      expect.objectContaining({ code: 'INTERNAL_ERROR', exitCode: 70 }),
    );
    expect(
      mapCliError(new Error('secret-bearing internal detail')).message,
    ).not.toContain('secret-bearing');
  });

  test('[L1:UNIT] TS-GC2-013 preserves deterministic source, agent, schema, cancellation, unavailable, and internal exits without raw diagnostics', () => {
    for (const [code, exitCode] of [
      ['TYPESCRIPT_SHEBANG_INVALID', 65],
      ['WORKFLOW_AGENT_FAILED', 67],
      ['WORKFLOW_OUTPUT_SCHEMA_FAILED', 68],
      ['CONTROL_PLANE_UNAVAILABLE', 69],
      ['WORKFLOW_CANCELLED', 130],
    ] as const) {
      const mapped = mapCliError(
        Object.assign(new Error('raw secret diagnostic'), {
          code,
          details: { runId: 'local-run', journalPath: '/bounded/journal.json' },
        }),
      );
      expect(mapped).toEqual(expect.objectContaining({ code, exitCode }));
      expect(mapped.message).not.toContain('raw secret diagnostic');
    }
  });
});
