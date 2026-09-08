import { readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const pluginRoot = resolve(import.meta.dirname, '../..');
const workspaceRoot = resolve(pluginRoot, '../..');
const json = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

describe('[L1:DOMAIN] canonical Codex and Nx plugin', () => {
  it('declares one Nx generator and canonical Codex components', () => {
    const project = json(resolve(pluginRoot, 'project.json'));
    const packageJson = json(resolve(pluginRoot, 'package.json'));
    const manifest = json(resolve(pluginRoot, '.codex-plugin/plugin.json'));
    const generators = json(resolve(pluginRoot, 'generators.json')) as {
      generators?: Record<string, unknown>;
    };

    expect(project['projectType']).toBe('library');
    expect(packageJson['generators']).toBe('./generators.json');
    expect(Object.keys(generators.generators ?? {})).toEqual(['init']);
    expect(manifest).toMatchObject({
      name: 'codex-control',
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
  });

  it('validates through a repository-owned portable Bun command', () => {
    const project = json(resolve(pluginRoot, 'project.json')) as {
      targets?: Record<string, { options?: { command?: string } }>;
    };

    expect(project.targets?.['validate-plugin']?.options?.command).toBe(
      'bun plugins/codex-control/scripts/validate-plugin.ts plugins/codex-control',
    );
  });

  it('accepts the actual plugin and rejects ingestion-invalid metadata', async () => {
    const project = json(resolve(pluginRoot, 'project.json')) as {
      targets?: Record<string, { options?: { command?: string } }>;
    };
    const command = project.targets?.['validate-plugin']?.options?.command;
    expect(command).toBeTruthy();
    if (!command) throw new Error('VALIDATOR_COMMAND_MISSING');
    const [executable, ...baseArguments] = command.split(' ');
    if (!executable) throw new Error('VALIDATOR_EXECUTABLE_MISSING');
    const root = await mkdtemp(resolve(tmpdir(), 'codex-plugin-validation-'));
    const copyRoot = resolve(root, 'codex-control');
    await cp(pluginRoot, copyRoot, { recursive: true });
    const run = () =>
      spawnSync(executable, [...baseArguments.slice(0, -1), copyRoot], {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });

    try {
      expect(run().status).toBe(0);
      const manifestPath = resolve(copyRoot, '.codex-plugin/plugin.json');
      const manifest = json(manifestPath);
      manifest['unsupportedField'] = true;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const invalid = run();
      expect(invalid.status).toBe(1);
      expect(invalid.stdout + invalid.stderr).toContain('unsupportedField');

      writeFileSync(
        manifestPath,
        `${JSON.stringify(json(resolve(pluginRoot, '.codex-plugin/plugin.json')), null, 2)}\n`,
      );
      const mcpPath = resolve(copyRoot, '.mcp.json');
      writeFileSync(mcpPath, '{');
      const malformedCompanion = run();
      expect(malformedCompanion.status).toBe(1);
      expect(malformedCompanion.stdout + malformedCompanion.stderr).toContain(
        'valid JSON',
      );

      writeFileSync(mcpPath, readFileSync(resolve(pluginRoot, '.mcp.json')));
      await rm(resolve(copyRoot, 'skills/codex-control/SKILL.md'));
      const missingSkill = run();
      expect(missingSkill.status).toBe(1);
      expect(missingSkill.stdout + missingSkill.stderr).toContain('SKILL.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ships the repo marketplace, thin runtime config, and two-call skill', () => {
    const marketplace = json(
      resolve(workspaceRoot, '.agents/plugins/marketplace.json'),
    ) as { plugins?: unknown[] };
    const mcp = json(resolve(pluginRoot, '.mcp.json')) as {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
    const skill = readFileSync(
      resolve(pluginRoot, 'skills/codex-control/SKILL.md'),
      'utf8',
    );

    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({
        name: 'codex-control',
        source: { source: 'local', path: './plugins/codex-control' },
      }),
    );
    expect(mcp.mcpServers?.['codex-control']).toMatchObject({
      command: 'node',
      args: ['./dist/server.mjs'],
      cwd: '.',
      env_vars: [
        'CODEX_CONTROL_ORIGIN',
        'CODEX_CONTROL_TOKEN_FILE',
        'CODEX_CONTROL_ACTOR_AGENT_ID',
      ],
    });
    expect(skill).toContain('delegate_agent');
    expect(skill).toContain('run_workflow');
    expect(skill).toContain('browser:control-in-app-browser');
    expect(skill).toContain('presentation.browserUrl');
    expect(skill).toContain('do not claim');
    expect(skill).toContain('same browserUrl');
  });
});
