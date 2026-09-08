import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
