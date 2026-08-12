import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';

interface DailyFact {
  industry: string;
  topic: string;
  asOfDate: string;
  summary: string;
  articles: Array<{
    title: string;
    url: string;
    publishedAt: string;
    publisher: string;
    publicationDateEvidence: string;
  }>;
}

interface ArtifactMetadata {
  name: string;
  path: string;
  publishedPath: string;
  digest: string;
  mediaType: string;
}

interface CliPayload {
  ok: boolean;
  mode: string;
  status: string;
  runId: string;
  journalPath: string;
  nodeCount: number;
  artifactCount: number;
  output: { facts: DailyFact[]; report: ArtifactMetadata };
}

interface JournalNode {
  id: string;
  label: string;
  dependencies: string[];
  model: string;
  reasoning: string;
  startedAt?: string;
  completedAt?: string;
  status: string;
  outcome?: string;
}

interface JournalDocument {
  schemaVersion: number;
  authority: string;
  runId: string;
  status: string;
  nodes: JournalNode[];
  events: Array<{ sequence: number; type: string }>;
  artifacts: ArtifactMetadata[];
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const stopWords = new Set([
  'about',
  'after',
  'amid',
  'from',
  'into',
  'latest',
  'more',
  'news',
  'over',
  'that',
  'their',
  'this',
  'through',
  'under',
  'update',
  'with',
]);

function significantTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 5 && !stopWords.has(token)),
    ),
  ];
}

function visibleDateCandidates(date: string): string[] {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const monthName = parsed.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const shortMonth = parsed.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return [
    date,
    `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
    `${monthName} ${day}, ${year}`,
    `${shortMonth} ${day}, ${year}`,
    `${day} ${monthName} ${year}`,
    `${day} ${shortMonth} ${year}`,
  ].map((item) => item.toLowerCase());
}

function assertPublicationWithinSevenDayWindow(
  publishedAt: string,
  currentUtcDate: string,
): void {
  assert.match(publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  const published = Date.parse(`${publishedAt}T00:00:00.000Z`);
  const current = Date.parse(`${currentUtcDate}T00:00:00.000Z`);
  assert.ok(Number.isFinite(published));
  const ageInDays = (current - published) / 86_400_000;
  assert.ok(
    Number.isInteger(ageInDays) && ageInDays >= 0 && ageInDays <= 7,
    `Article date is outside the seven-day UTC publication window: ${publishedAt}`,
  );
}

async function verifyLiveArticle(
  article: DailyFact['articles'][number],
  fact: DailyFact,
): Promise<void> {
  const context =
    `${fact.industry} ${fact.topic} ${fact.summary}`.toLowerCase();
  const titleTokens = significantTokens(article.title);
  const titleAcronyms = [
    ...new Set(
      [...article.title.matchAll(/\b[A-Z][A-Z0-9]{1,4}\b/g)].map((match) =>
        match[0].toLowerCase(),
      ),
    ),
  ];
  assert.ok(
    titleTokens.some((token) => context.includes(token)) ||
      titleAcronyms.some((token) =>
        new RegExp(`\\b${token}\\b`, 'i').test(context),
      ),
    `Article is not visibly relevant to its brief: ${article.url}`,
  );
  const response = await fetch(article.url, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'codex-workflows-founder-l3/1.0',
    },
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(
    response.ok,
    `Article did not return a successful HTTP response: ${article.url} (${response.status})`,
  );
  assert.match(
    response.headers.get('content-type') ?? '',
    /(?:text\/html|application\/xhtml\+xml)/i,
  );
  const finalUrl = new URL(response.url);
  assert.ok(!finalUrl.hostname.endsWith('reddit.com'));
  const page = (await response.text()).slice(0, 2_000_000).toLowerCase();
  const matchingTitleTokens = titleTokens.filter((token) =>
    page.includes(token),
  );
  assert.ok(
    matchingTitleTokens.length >= Math.min(2, titleTokens.length),
    `Publisher page does not contain the claimed article title: ${article.url}`,
  );
  const dateEvidence = [
    article.publicationDateEvidence.toLowerCase(),
    ...visibleDateCandidates(article.publishedAt),
  ];
  assert.ok(
    dateEvidence.some((candidate) => page.includes(candidate)),
    `Publisher page does not expose current-day publication evidence: ${article.url}`,
  );
}

function utcTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function installedBinary(): string | undefined {
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(entry, 'codex-workflows');
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function internalTypeScriptTemps(): string[] {
  return readdirSync(tmpdir())
    .filter((entry) => entry.startsWith('codex-workflows-ts-'))
    .sort();
}

function temporaryFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.tmp')) result.push(path);
    }
  };
  visit(root);
  return result.sort();
}

function workspaceDiffDigest(workspace: string, allowedPrefix: string): string {
  const listing = spawnSync(
    'git',
    ['ls-files', '-m', '--others', '--exclude-standard', '-z'],
    { cwd: workspace, encoding: 'utf8' },
  );
  assert.equal(listing.status, 0, listing.stderr);
  const paths = listing.stdout
    .split('\0')
    .filter(Boolean)
    .filter((path) => !path.startsWith(allowedPrefix))
    .sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    const absolute = resolve(workspace, path);
    const metadata = statSync(absolute);
    digest.update(`${path}\0${metadata.mode & 0o777}\0`);
    digest.update(readFileSync(absolute));
  }
  return `sha256:${digest.digest('hex')}`;
}

function workspaceRoot(): string {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return realpathSync(result.stdout.trim());
}

function isolatedTmuxEnvironment(root: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    TMUX_TMPDIR: root,
  };
  delete environment.TMUX;
  return environment;
}

function tmuxSessions(root: string): string[] {
  const listing = spawnSync(
    'tmux',
    ['list-sessions', '-F', '#{session_name}'],
    {
      encoding: 'utf8',
      env: isolatedTmuxEnvironment(root),
    },
  );
  if (listing.status !== 0) return [];
  return listing.stdout.trim().split('\n').filter(Boolean).sort();
}

function processGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGroupExit(processGroupId: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!processGroupExists(processGroupId)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
}

export class DailyFactsDriver {
  readonly workspace = workspaceRoot();
  readonly source = resolve(
    this.workspace,
    'apps/codex-workflows/examples/daily-facts.workflow.ts',
  );
  readonly timestamp = utcTimestamp(new Date());
  readonly utcDate =
    this.timestamp.slice(0, 4) +
    '-' +
    this.timestamp.slice(4, 6) +
    '-' +
    this.timestamp.slice(6, 8);
  readonly relativeOutputRoot = `.agent/testing/workflows/${this.timestamp}`;
  readonly outputRoot = resolve(this.workspace, this.relativeOutputRoot);
  readonly reportPath = join(this.outputRoot, 'DAILY_FACTS.md');
  readonly stateRoot = join(this.outputRoot, 'run-state');
  readonly tmuxRoot = join(this.outputRoot, 'tmux');
  readonly inputPath = join(this.outputRoot, '.daily-facts.input.json');
  readonly binDirectory = join(this.outputRoot, '.bin');
  private beforeTemps: string[] = [];
  private afterTemps: string[] = [];
  private beforeTmux: string[] = [];
  private afterTmux: string[] = [];
  private beforeDiffDigest = '';
  private afterDiffDigest = '';
  private processGroupId?: number;
  private payload?: CliPayload;
  private journal?: JournalDocument;
  private report = '';
  private executionFailure?: unknown;

  prepare(): {
    exactShebang: boolean;
    executableSource: boolean;
    installedWorkspaceBinary: boolean;
  } {
    const sourceBytes = existsSync(this.source)
      ? readFileSync(this.source, 'utf8')
      : '';
    const exactShebang = sourceBytes
      ? sourceBytes.split('\n', 1)[0] === '#!/usr/bin/env -S codex-workflows'
      : false;
    const binary = installedBinary();
    assert.ok(binary, 'codex-workflows must resolve in PATH');
    const expectedBinary = resolve(
      this.workspace,
      'apps/codex-workflows/dist/main.js',
    );
    assert.equal(realpathSync(binary), expectedBinary);
    const executableSource =
      existsSync(this.source) && (statSync(this.source).mode & 0o111) !== 0;
    this.beforeTemps = internalTypeScriptTemps();
    this.beforeTmux = tmuxSessions(this.tmuxRoot);
    this.beforeDiffDigest = workspaceDiffDigest(
      this.workspace,
      `${this.relativeOutputRoot}/`,
    );
    return {
      exactShebang,
      executableSource,
      installedWorkspaceBinary: true,
    };
  }

  async execute(): Promise<void> {
    assert.notEqual(this.beforeDiffDigest, '', 'prepare must run first');
    try {
      if (!existsSync(this.source)) {
        throw new Error(
          `Canonical daily-facts workflow is missing: ${this.source}`,
        );
      }
      let stdout = '';
      let stderr = '';
      mkdirSync(this.binDirectory, { recursive: true, mode: 0o700 });
      mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
      const expectedBinary = resolve(
        this.workspace,
        'apps/codex-workflows/dist/main.js',
      );
      chmodSync(expectedBinary, 0o755);
      symlinkSync(expectedBinary, join(this.binDirectory, 'codex-workflows'));
      writeFileSync(
        this.inputPath,
        `${JSON.stringify({
          utcTimestamp: this.timestamp,
          selectionSeed: `${this.utcDate}-founder-daily-34`,
        })}\n`,
        { mode: 0o600 },
      );
      const execution = await new Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
      }>((resolveExit, rejectExecution) => {
        const child = spawn(
          this.source,
          ['--input', this.inputPath, '--json'],
          {
            cwd: this.workspace,
            detached: true,
            env: {
              ...isolatedTmuxEnvironment(this.tmuxRoot),
              PATH: `${this.binDirectory}${delimiter}${process.env.PATH ?? ''}`,
              CODEX_WORKFLOWS_HOME: this.stateRoot,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        assert.ok(child.pid);
        this.processGroupId = child.pid;
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        const timeout = setTimeout(() => {
          if (child.pid && processGroupExists(child.pid)) {
            process.kill(-child.pid, 'SIGTERM');
          }
        }, 840_000);
        child.once('error', rejectExecution);
        child.once('close', (exitCode, signal) => {
          clearTimeout(timeout);
          resolveExit({ exitCode, signal });
        });
      });
      assert.equal(execution.signal, null, stderr);
      assert.equal(execution.exitCode, 0, stderr);
      assert.notEqual(stdout.trim(), '', 'public runner must emit final JSON');
      this.payload = JSON.parse(stdout) as CliPayload;
      this.journal = JSON.parse(
        readFileSync(this.payload.journalPath, 'utf8'),
      ) as JournalDocument;
      this.report = readFileSync(this.reportPath, 'utf8');
      assert.ok(this.processGroupId);
      await waitForProcessGroupExit(this.processGroupId);
      this.afterTemps = internalTypeScriptTemps();
      this.afterTmux = tmuxSessions(this.tmuxRoot);
      this.afterDiffDigest = workspaceDiffDigest(
        this.workspace,
        `${this.relativeOutputRoot}/`,
      );
    } catch (error) {
      this.executionFailure = error;
    } finally {
      rmSync(this.inputPath, { force: true });
      rmSync(this.binDirectory, { force: true, recursive: true });
    }
  }

  assertExecutionSucceeded(): void {
    assert.ifError(this.executionFailure);
  }

  assertResearchTopology(): {
    completedNodes: number;
    concurrentRoots: number;
    consolidators: number;
  } {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.equal(this.payload.ok, true);
    assert.equal(this.payload.mode, 'local-trusted-typescript');
    assert.equal(this.payload.status, 'completed');
    assert.equal(this.payload.nodeCount, 3);
    assert.equal(this.payload.artifactCount, 1);
    assert.equal(this.journal.nodes.length, 3);
    assert.ok(
      this.journal.nodes.every(
        (node) =>
          node.status === 'completed' &&
          node.outcome === 'completed' &&
          node.model === 'gpt-5.6-luna' &&
          node.reasoning === 'medium' &&
          node.dependencies.length === 0,
      ),
    );
    const firstCompletion = Math.min(
      ...this.journal.nodes.map((node) => Date.parse(node.completedAt ?? '')),
    );
    assert.ok(
      this.journal.nodes.every(
        (node) => Date.parse(node.startedAt ?? '') < firstCompletion,
      ),
      'all three research nodes must overlap before the first completes',
    );
    assert.equal(
      this.journal.nodes.filter((node) => node.dependencies.length > 0).length,
      0,
    );
    return { completedNodes: 3, concurrentRoots: 3, consolidators: 0 };
  }

  async assertCurrentLinkedBriefs(): Promise<{
    briefs: number;
    distinctPairs: number;
    directHttpsLinks: number;
  }> {
    assert.ok(this.payload);
    const facts = this.payload.output.facts;
    assert.equal(facts.length, 3);
    const pairs = new Set(
      facts.map(
        (fact) =>
          `${fact.industry.trim().toLowerCase()}\0${fact.topic
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')}`,
      ),
    );
    assert.equal(pairs.size, 3);
    let directHttpsLinks = 0;
    for (const fact of facts) {
      assert.equal(fact.asOfDate, this.utcDate);
      assert.ok(fact.summary.trim().split(/\s+/).length >= 25);
      assert.ok(fact.articles.length >= 2);
      for (const article of fact.articles) {
        assertPublicationWithinSevenDayWindow(
          article.publishedAt,
          this.utcDate,
        );
        assert.ok(article.title.trim().length >= 8);
        const url = new URL(article.url);
        assert.equal(url.protocol, 'https:');
        assert.ok(
          !url.hostname.endsWith('.example') &&
            !['example.com', 'example.org', 'example.net'].includes(
              url.hostname,
            ),
        );
        directHttpsLinks += 1;
      }
      await Promise.all(
        fact.articles.map((article) => verifyLiveArticle(article, fact)),
      );
      assert.ok(
        this.report.includes(
          `## What's going on with ${fact.industry} in ${fact.topic}`,
        ),
      );
    }
    assert.ok(directHttpsLinks >= 6);
    return { briefs: 3, distinctPairs: 3, directHttpsLinks: 6 };
  }

  assertReportAndResources(): {
    artifactDigestValid: boolean;
    terminalEventLast: boolean;
    processGroupDelta: number;
    tmuxDelta: number;
    temporaryResourceDelta: number;
    unauthorizedWorkspaceDiffDelta: number;
  } {
    assert.ok(this.payload);
    assert.ok(this.journal);
    assert.ok(this.processGroupId);
    const artifact = this.payload.output.report;
    assert.equal(artifact.name, 'DAILY_FACTS.md');
    assert.equal(artifact.mediaType, 'text/markdown');
    assert.equal(
      realpathSync(artifact.publishedPath),
      realpathSync(this.reportPath),
    );
    assert.equal(artifact.digest, sha256(this.report));
    assert.equal(this.journal.artifacts.length, 1);
    assert.deepEqual(this.journal.artifacts[0], artifact);
    assert.deepEqual(
      this.journal.events.map((event) => event.sequence),
      this.journal.events.map((_event, index) => index + 1),
    );
    assert.equal(this.journal.events.at(-1)?.type, 'workflow.completed');
    assert.equal(processGroupExists(this.processGroupId), false);
    assert.deepEqual(
      this.afterTmux.filter((session) => !this.beforeTmux.includes(session)),
      [],
      'the workflow must not add a tmux session',
    );
    assert.deepEqual(
      this.afterTemps.filter((path) => !this.beforeTemps.includes(path)),
      [],
      'the workflow must not retain a new TypeScript loader temporary path',
    );
    assert.deepEqual(temporaryFiles(this.outputRoot), []);
    assert.equal(this.afterDiffDigest, this.beforeDiffDigest);
    assert.equal(
      dirname(relative(this.workspace, this.reportPath)),
      this.relativeOutputRoot,
    );
    return {
      artifactDigestValid: true,
      terminalEventLast: true,
      processGroupDelta: 0,
      tmuxDelta: 0,
      temporaryResourceDelta: 0,
      unauthorizedWorkspaceDiffDelta: 0,
    };
  }
}
