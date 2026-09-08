import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as workflows from '../index.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cas-wa-source-'));
  roots.push(root);
  const artifactDirectory = join(root, 'artifacts');
  const sourceRoot = join(root, 'source');
  await mkdir(sourceRoot);
  await writeFile(join(sourceRoot, 'value.ts'), 'export const value = 7;');
  await writeFile(
    join(sourceRoot, 'demo.workflow.ts'),
    'import {defineWorkflow} from "@codex/workflows"; import {value} from "./value.ts"; export default defineWorkflow({id:"demo",run:()=>value});',
  );
  const compile = Reflect.get(workflows, 'compileWorkflowSource');
  const load = Reflect.get(workflows, 'loadCompiledWorkflowSource');
  expect(compile, 'shared trusted source compiler').toBeTypeOf('function');
  expect(load, 'durable compiled workflow resolver').toBeTypeOf('function');
  return { compile, load, sourceRoot, artifactDirectory };
}

// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] workflow source compiler', () => {
  it('WA-L2-COMPILATION binds relative dependency bytes and verifies persisted executable', async () => {
    const { compile, load, sourceRoot, artifactDirectory } = await fixture();
    const context = { sourceRoot, artifactDirectory };
    const first = await compile('demo.workflow.ts', context);
    expect(
      (await load(artifactDirectory, first.workflowRef)).definition.run({}),
    ).toBe(7);
    expect(await compile('demo.workflow.ts', context)).toEqual(first);
    await writeFile(join(sourceRoot, 'value.ts'), 'export const value = 9;');
    const changed = await compile('demo.workflow.ts', context);
    expect(changed.sourceDigest).not.toBe(first.sourceDigest);
    expect(
      (await load(artifactDirectory, first.workflowRef)).definition.run({}),
    ).toBe(7);
    expect(
      (await load(artifactDirectory, changed.workflowRef)).definition.run({}),
    ).toBe(9);
    const executable = join(artifactDirectory, `${first.workflowRef}.mjs`);
    await writeFile(
      executable,
      `${await readFile(executable, 'utf8')}\n// altered`,
    );
    await expect(load(artifactDirectory, first.workflowRef)).rejects.toThrow(
      /INTEGRITY/,
    );
  });

  it('WA-L2-COMPILATION rejects outside source and import symlinks before execution', async () => {
    const { compile, sourceRoot, artifactDirectory } = await fixture();
    const outside = join(sourceRoot, '..', 'outside.ts');
    await writeFile(outside, 'throw new Error("OUTSIDE_EXECUTED");');
    await symlink(outside, join(sourceRoot, 'escape.workflow.ts'));
    await expect(
      compile('escape.workflow.ts', { sourceRoot, artifactDirectory }),
    ).rejects.toThrow(/OUTSIDE/);
    await writeFile(
      join(sourceRoot, 'demo.workflow.ts'),
      'import "../outside.ts"; export default {};',
    );
    await expect(
      compile('demo.workflow.ts', { sourceRoot, artifactDirectory }),
    ).rejects.toThrow(/OUTSIDE|COMPILE/);
  });

  it('WA-L2-COMPILATION rejects malformed source and invalid workflow export', async () => {
    const { compile, sourceRoot, artifactDirectory } = await fixture();
    await writeFile(join(sourceRoot, 'demo.workflow.ts'), 'export default {');
    await expect(
      compile('demo.workflow.ts', { sourceRoot, artifactDirectory }),
    ).rejects.toThrow(/COMPILE/);
    await writeFile(join(sourceRoot, 'demo.workflow.ts'), 'export default {};');
    await expect(
      compile('demo.workflow.ts', { sourceRoot, artifactDirectory }),
    ).rejects.toThrow(/EXPORT/);
    await writeFile(
      join(sourceRoot, 'demo.workflow.ts'),
      'export async function later(p){ return import(p); } export default {};',
    );
    await expect(
      compile('demo.workflow.ts', { sourceRoot, artifactDirectory }),
    ).rejects.toThrow(/COMPILE/);
  });
});
