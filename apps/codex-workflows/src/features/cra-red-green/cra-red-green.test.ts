import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  auditCraProject,
  CRA_AUDIT_CRITERIA,
  snapshotCraTree,
} from './support/contract.js';

const passingCommands = { testExitCode: 0, buildExitCode: 0 };

async function fixture(root: string, remediated = false): Promise<string> {
  const project = join(root, 'cra-proof-app');
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(
    join(project, 'package.json'),
    `${JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        'react-scripts': '5.0.1',
      },
      scripts: {
        start: 'react-scripts start',
        build: 'react-scripts build',
        test: 'react-scripts test',
      },
    })}\n`,
  );
  await writeFile(
    join(project, 'src/App.js'),
    remediated
      ? `export default function App() { return <main><h1>Workflow Proof</h1><p data-testid="audit-remediation-status">Audit findings resolved</p></main>; }\n`
      : `export default function App() { return <main><h1>Workflow Proof</h1></main>; }\n`,
  );
  await writeFile(
    join(project, 'src/App.test.js'),
    remediated
      ? `test('audit remediation', () => { expect(screen.getByTestId('audit-remediation-status')).toHaveTextContent('Audit findings resolved'); });\n`
      : `test('heading', () => { expect(screen.getByText('Workflow Proof')).toBeInTheDocument(); });\n`,
  );
  return project;
}

// === L1: UNIT TESTS ===
describe('[L1:UNIT] CRA RED to GREEN fixed policy', () => {
  test('[L1:UNIT] CRA-RG-GC1-001 returns deterministic RED for only the two intentional baseline gaps', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-red-'));
    try {
      const project = await fixture(root);
      const audit = await auditCraProject(project, passingCommands, root);
      expect(audit.verdict).toBe('RED');
      expect(audit.findings).toHaveLength(CRA_AUDIT_CRITERIA.length);
      expect(
        audit.findings
          .filter((finding) => finding.status === 'FAIL')
          .map((finding) => finding.id),
      ).toEqual(['CRA-AUDIT-003', 'CRA-AUDIT-004']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] CRA-RG-GC1-001 becomes GREEN after only the chartered remediation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-green-'));
    try {
      const project = await fixture(root, true);
      const audit = await auditCraProject(project, passingCommands, root);
      expect(audit.verdict).toBe('GREEN');
      expect(audit.findings.every((finding) => finding.status === 'PASS')).toBe(
        true,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] CRA-RG-GC1-001 rejects a malformed package contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-package-'));
    try {
      const project = await fixture(root, true);
      await writeFile(join(project, 'package.json'), '{}\n');
      const audit = await auditCraProject(project, passingCommands, root);
      expect(audit.verdict).toBe('RED');
      expect(audit.findings[0]).toEqual(
        expect.objectContaining({ id: 'CRA-AUDIT-001', status: 'FAIL' }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] CRA-RG-GC1-001 rejects a missing exact heading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-heading-'));
    try {
      const project = await fixture(root, true);
      await writeFile(
        join(project, 'src/App.js'),
        '<h1>Almost Workflow Proof</h1><p data-testid="audit-remediation-status">Audit findings resolved</p>\n',
      );
      const audit = await auditCraProject(project, passingCommands, root);
      expect(audit.findings[1]).toEqual(
        expect.objectContaining({ id: 'CRA-AUDIT-002', status: 'FAIL' }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] CRA-RG-GC1-001 fails closed when the project escapes its admitted root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-boundary-'));
    try {
      const allowed = join(root, 'allowed');
      const outside = join(root, 'outside');
      await mkdir(allowed);
      const project = await fixture(outside, true);
      await expect(snapshotCraTree(project, allowed)).rejects.toThrow(
        /escaped its admitted proof root/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('[L1:UNIT] CRA-RG-GC1-001 hashes the same bounded source tree deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cra-audit-digest-'));
    try {
      const project = await fixture(root, true);
      await mkdir(join(project, 'node_modules'));
      await writeFile(join(project, 'node_modules/ignored.js'), 'different\n');
      const first = await snapshotCraTree(project, root);
      await writeFile(join(project, 'node_modules/ignored.js'), 'changed\n');
      const second = await snapshotCraTree(project, root);
      expect(second).toEqual(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
