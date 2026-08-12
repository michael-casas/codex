#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const tracePath = process.env.CODEX_CRA_RED_GREEN_TEST_TRACE;
const failStage = process.env.CODEX_CRA_RED_GREEN_FAIL_STAGE;
const extraScaffold = process.env.CODEX_CRA_RED_GREEN_EXTRA_SCAFFOLD === 'true';
const args = process.argv.slice(2);
const stage = input.includes('__CRA_RED_GREEN_BUILDER__')
  ? 'builder'
  : input.includes('__CRA_RED_GREEN_AUDITOR__')
    ? 'auditor'
    : input.includes('__CRA_RED_GREEN_REMEDIATOR__')
      ? 'remediator'
      : 'unknown';
const quotedPath =
  stage === 'builder'
    ? /exact absolute path ("(?:\\.|[^"\\])*")/.exec(input)?.[1]
    : /"projectPath":("(?:\\.|[^"\\])*")/.exec(input)?.[1];
const projectPath = quotedPath ? JSON.parse(quotedPath) : undefined;
const quotedLauncher =
  stage === 'builder'
    ? /workflow-owned launcher once: ("(?:\\.|[^"\\])*")/.exec(input)?.[1]
    : undefined;
const launcherPath = quotedLauncher ? JSON.parse(quotedLauncher) : undefined;

const trace = (value) => {
  if (tracePath) appendFileSync(tracePath, `${JSON.stringify(value)}\n`);
};
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

trace({ type: 'started', stage, pid: process.pid, args, atMs: Date.now() });
emit({ type: 'thread.started', thread_id: `controlled-cra-${stage}` });
emit({ type: 'turn.started' });

let response;
if (stage === 'builder' && projectPath && launcherPath) {
  const scaffold = spawnSync(launcherPath, [], {
    cwd: process.cwd(),
    env: { ...process.env },
    encoding: 'utf8',
  });
  if (scaffold.error || scaffold.status !== 0) {
    trace({
      type: 'failed',
      stage,
      pid: process.pid,
      scaffoldStatus: scaffold.status,
      atMs: Date.now(),
    });
    emit({
      type: 'turn.failed',
      error: { message: 'controlled CRA scaffold launcher failed' },
    });
    process.exit(0);
  }
  emit({
    type: 'item.completed',
    item: {
      id: 'controlled-cra-scaffold-command',
      type: 'command_execution',
      command: launcherPath,
      aggregated_output: '',
      exit_code: 0,
      status: 'completed',
    },
  });
  if (extraScaffold) {
    emit({
      type: 'item.completed',
      item: {
        id: 'controlled-cra-extra-scaffold-command',
        type: 'command_execution',
        command: `npx --yes create-react-app@5.1.0 ${projectPath} --use-npm`,
        aggregated_output: '',
        exit_code: 0,
        status: 'completed',
      },
    });
  }
  if (failStage === stage) {
    mkdirSync(join(projectPath, 'build'), { recursive: true });
    mkdirSync(join(dirname(projectPath), 'npm-cache'), { recursive: true });
    const lingering = spawn(
      process.execPath,
      [
        '-e',
        `const { mkdirSync } = require('node:fs'); const { join } = require('node:path'); const [projectPath, proofRoot] = process.argv.slice(1); setTimeout(() => { mkdirSync(join(projectPath, 'node_modules', 'recreated'), { recursive: true }); mkdirSync(join(proofRoot, 'npm-cache', 'recreated'), { recursive: true }); }, 750); setTimeout(() => {}, 5000);`,
        projectPath,
        dirname(projectPath),
      ],
      { detached: true, stdio: 'ignore' },
    );
    lingering.unref();
    trace({ type: 'failed', stage, pid: process.pid, atMs: Date.now() });
    emit({
      type: 'turn.failed',
      error: { message: 'controlled provider failure after CRA scaffold' },
    });
    process.exit(0);
  }
  response = {
    status: 'BASELINE_CREATED',
    projectPath,
  };
} else if (stage === 'auditor') {
  const treeDigest =
    /"treeDigest":"(sha256:[a-f0-9]{64})"/.exec(input)?.[1] ?? '';
  const leakedBuilderFailure = /"(?:test|build)ExitCode":1/.test(input);
  response = {
    verdict: 'RED',
    treeDigest,
    findings: [
      ['CRA-AUDIT-001', 'PASS'],
      ['CRA-AUDIT-002', 'PASS'],
      ['CRA-AUDIT-003', 'FAIL'],
      ['CRA-AUDIT-004', 'FAIL'],
      ['CRA-AUDIT-005', leakedBuilderFailure ? 'FAIL' : 'PASS'],
    ].map(([id, status]) => ({
      id,
      status,
      summary: `Controlled fixed audit result for ${id}.`,
    })),
  };
} else if (stage === 'remediator' && projectPath) {
  writeFileSync(
    join(projectPath, 'src/App.js'),
    'export default function App() { return <main><h1>Workflow Proof</h1><p data-testid="audit-remediation-status">Audit findings resolved</p></main>; }\n',
  );
  writeFileSync(
    join(projectPath, 'src/App.test.js'),
    "test('audit remediation', () => { expect(screen.getByTestId('audit-remediation-status')).toHaveTextContent('Audit findings resolved'); });\n",
  );
  response = {
    status: 'READY_FOR_EXTERNAL_AUDIT',
    projectPath,
    addressedFindings: ['CRA-AUDIT-003', 'CRA-AUDIT-004'],
    testExitCode: 0,
    buildExitCode: 0,
  };
} else {
  emit({ type: 'turn.failed', error: { message: 'unknown controlled stage' } });
  process.exit(0);
}

emit({
  type: 'item.completed',
  item: {
    id: `controlled-cra-${stage}`,
    type: 'agent_message',
    text: JSON.stringify(response),
  },
});
emit({
  type: 'turn.completed',
  usage: {
    input_tokens: 10,
    cached_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 5,
  },
});
trace({ type: 'completed', stage, pid: process.pid, atMs: Date.now() });
