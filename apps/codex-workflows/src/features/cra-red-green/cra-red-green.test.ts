import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  auditBunReactProject,
  BUN_REACT_AUDIT_CRITERIA,
  snapshotBunReactTree,
} from './support/contract.js';

const passingCommands = {
  installExitCode: 0,
  testExitCode: 0,
  buildExitCode: 0,
  executable: 'bun' as const,
};

async function fixture(root: string, remediated = false): Promise<string> {
  const project = join(root, 'bun-react-proof-app');
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(
    join(project, 'package.json'),
    `${JSON.stringify({
      name: 'bun-react-proof-app',
      private: true,
      version: '0.0.0',
      type: 'module',
      packageManager: 'bun@1.4.2',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        test: 'bun test',
      },
      dependencies: {
        react: '^19.2.8',
        'react-dom': '^19.2.8',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^6.1.0',
        vite: '^8.2.2',
      },
    })}\n`,
  );
  await writeFile(join(project, 'bun.lock'), '{"lockfileVersion":1}\n');
  await writeFile(
    join(project, 'src/App.jsx'),
    remediated
      ? `export default function App() { return <main><h1>Workflow Proof</h1><p data-testid="audit-remediation-status">Audit findings resolved</p></main>; }\n`
      : `export default function App() { return <main><h1>Workflow Proof</h1></main>; }\n`,
  );
  await writeFile(
    join(project, 'src/App.test.jsx'),
    remediated
      ? `test('audit remediation', () => { expect(markup).toContain('audit-remediation-status'); expect(markup).toContain('Audit findings resolved'); });\n`
      : `test('heading', () => { expect(markup).toContain('Workflow Proof'); });\n`,
  );
  return project;
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] Bun React RED to GREEN fixed policy', () => {
  test('[L1:UNIT] BUN-REACT-RG-GC1-001 returns deterministic RED for only the two intentional baseline gaps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-red-'));
    try {
      const audit = await auditBunReactProject(
        await fixture(root),
        passingCommands,
        root,
      );
      expect(audit.verdict).toBe('RED');
      expect(audit.findings).toHaveLength(BUN_REACT_AUDIT_CRITERIA.length);
      expect(
        audit.findings
          .filter((finding) => finding.status === 'FAIL')
          .map((finding) => finding.id),
      ).toEqual(['BUN-REACT-AUDIT-003', 'BUN-REACT-AUDIT-004']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 becomes GREEN after only the chartered remediation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-green-'));
    try {
      const audit = await auditBunReactProject(
        await fixture(root, true),
        passingCommands,
        root,
      );
      expect(audit.verdict).toBe('GREEN');
      expect(audit.findings.every((finding) => finding.status === 'PASS')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 rejects malformed Vite package identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-package-'));
    try {
      const project = await fixture(root, true);
      await writeFile(join(project, 'package.json'), '{}\n');
      const audit = await auditBunReactProject(project, passingCommands, root);
      expect(audit.findings[0]).toEqual(
        expect.objectContaining({ id: 'BUN-REACT-AUDIT-001', status: 'FAIL' }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 rejects foreign lockfiles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-lock-'));
    try {
      const project = await fixture(root, true);
      await writeFile(join(project, 'package-lock.json'), '{}\n');
      const audit = await auditBunReactProject(project, passingCommands, root);
      expect(audit.findings[0]?.status).toBe('FAIL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 rejects non-Bun command evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-command-'));
    try {
      const project = await fixture(root, true);
      const audit = await auditBunReactProject(
        project,
        { ...passingCommands, executable: 'npm' as never },
        root,
      );
      expect(audit.findings[4]?.status).toBe('FAIL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 fails closed on path escape', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-boundary-'));
    try {
      const allowed = join(root, 'allowed');
      const outside = join(root, 'outside');
      await mkdir(allowed);
      const project = await fixture(outside, true);
      await expect(snapshotBunReactTree(project, allowed)).rejects.toThrow(
        /escaped its admitted proof root/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] BUN-REACT-RG-GC1-001 hashes the bounded source tree deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-react-audit-digest-'));
    try {
      const project = await fixture(root, true);
      await mkdir(join(project, 'node_modules'));
      await writeFile(join(project, 'node_modules/ignored.js'), 'different\n');
      const first = await snapshotBunReactTree(project, root);
      await writeFile(join(project, 'node_modules/ignored.js'), 'changed\n');
      expect(await snapshotBunReactTree(project, root)).toEqual(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
