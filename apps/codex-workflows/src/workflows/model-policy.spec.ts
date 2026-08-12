import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../../..');
const permittedReasoning = 'medium';

// === L2: REAL FILESYSTEM POLICY BOUNDARY TESTS ===

const TypeScriptExecutionSurfaces = [
  'apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.ts',
  'apps/codex-workflows/src/workflows/support/controlled.workflow.fixture.txt',
  'packages/workflows/src/authoring/authoring.test.ts',
] as const;

describe('[L2:INTEGRATION] Founder gpt-* workflow execution policy', () => {
  test('[L2:INTEGRATION] GPT-GC1-003 permits valid gpt-* medium declarations without a model-name allowlist', async () => {
    for (const relativePath of TypeScriptExecutionSurfaces) {
      const source = await readFile(resolve(workspace, relativePath), 'utf8');
      const declarations = [
        ...source.matchAll(
          /\bmodel:\s*['"]([^'"]+)['"]\s*,\s*reasoning:\s*['"]([^'"]+)['"]/g,
        ),
      ].map((match) => ({ model: match[1], reasoning: match[2] }));
      const models = declarations.map(({ model }) => model ?? '');
      const reasoning = declarations.map(({ reasoning: value }) => value ?? '');

      expect(
        models.length,
        `${relativePath} must exercise explicit models`,
      ).toBeGreaterThan(0);
      expect(
        models.every((model) => /^gpt-\S+$/.test(model)),
        `${relativePath} model declarations`,
      ).toBe(true);
      expect(
        reasoning.length,
        `${relativePath} must exercise explicit reasoning`,
      ).toBeGreaterThan(0);
      expect(
        new Set(reasoning),
        `${relativePath} reasoning declarations`,
      ).toEqual(new Set([permittedReasoning]));
    }

    const jsonPath = resolve(
      workspace,
      'apps/codex-workflows/examples/nestjs-resolver-factory-research.workflow.json',
    );
    const json = JSON.parse(await readFile(jsonPath, 'utf8')) as {
      policy?: { allowedModels?: string[] };
      steps?: Array<{
        kind?: string;
        handler?: { type?: string; model?: string; prompt?: string };
      }>;
    };
    const agents = (json.steps ?? []).filter(
      (step) => step.kind === 'task' && step.handler?.type === 'codex',
    );

    expect(agents.length).toBeGreaterThan(0);
    expect(
      agents.every((step) => /^gpt-\S+$/.test(step.handler?.model ?? '')),
    ).toBe(true);
    expect(
      agents.every((step) =>
        step.handler?.prompt?.startsWith('Use medium reasoning.'),
      ),
    ).toBe(true);
    expect(
      json.policy?.allowedModels?.every((model) => /^gpt-\S+$/.test(model)),
    ).toBe(true);
    expect(
      agents.map((step) => step.handler?.prompt).filter(Boolean),
    ).toHaveLength(agents.length);
  });
});
