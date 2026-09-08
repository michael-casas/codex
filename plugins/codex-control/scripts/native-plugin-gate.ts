import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDockerRunArguments,
  parseNativeGateOptions,
  withOwnedContainerCleanup,
  type NativeGateOptions,
} from './native-plugin-gate-lib.js';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = join(pluginRoot, 'scripts');
const allowedPluginEntries = ['.codex-plugin', '.mcp.json', 'dist', 'skills'];

function usage(): string {
  return `CAS native plugin clean-install gate

Default, credential-free and without a paid turn:
  bun nx run @codex/plugin-codex-control:native-plugin-smoke --skipNxCache

Opt-in authenticated read-only snapshot gate:
  CAS_NATIVE_PLUGIN_TOKEN_FILE=/owner-only/token \\
    bun nx run @codex/plugin-codex-control:native-plugin-live --skipNxCache

Add --args=--paid-agent and CAS_NATIVE_PLUGIN_AUTH_FILE=/owner-only/auth.json
only for one explicitly authorized gpt-5.6-terra low turn. There is no retry.

Options: --live, --paid-agent, --image=<local-image>, --backend-port=<port>,
--rpc-timeout-ms=<ms>, --turn-timeout-ms=<ms>. The backend must be reachable
inside Docker as host.docker.internal; its accepted Host remains loopback.
`;
}

async function requireOwnerOnlyFile(
  path: string,
  label: string,
): Promise<void> {
  const metadata = await stat(path).catch(() => undefined);
  if (!metadata?.isFile()) throw new Error(`${label}_FILE_REQUIRED`);
  if ((metadata.mode & 0o077) !== 0)
    throw new Error(`${label}_MUST_BE_OWNER_ONLY`);
}

async function listFiles(root: string, relative = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, relative), {
    withFileTypes: true,
  })) {
    const child = join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('STAGED_SYMLINK_FORBIDDEN');
    if (entry.isDirectory()) result.push(...(await listFiles(root, child)));
    else if (entry.isFile()) result.push(child);
    else throw new Error('STAGED_SPECIAL_FILE_FORBIDDEN');
  }
  return result.sort();
}

async function stageConsumer(root: string): Promise<{
  marketplaceRoot: string;
  harnessRoot: string;
  packageDigest: string;
}> {
  const marketplaceRoot = join(root, 'market');
  const stagedPlugin = join(marketplaceRoot, 'plugins', 'codex-control');
  const marketplaceManifestRoot = join(marketplaceRoot, '.agents', 'plugins');
  const harnessRoot = join(root, 'harness');
  await mkdir(stagedPlugin, { recursive: true, mode: 0o700 });
  await mkdir(marketplaceManifestRoot, { recursive: true, mode: 0o700 });
  await mkdir(harnessRoot, { recursive: true, mode: 0o700 });
  for (const entry of allowedPluginEntries) {
    const source = join(pluginRoot, entry);
    await lstat(source).catch(() => {
      throw new Error(`BUILT_PLUGIN_ASSET_MISSING:${entry}`);
    });
    await cp(source, join(stagedPlugin, entry), {
      recursive: true,
      errorOnExist: true,
    });
  }
  await writeFile(
    join(marketplaceManifestRoot, 'marketplace.json'),
    `${JSON.stringify(
      {
        name: 'codex-control-local',
        interface: { displayName: 'Codex Control Local Gate' },
        plugins: [
          {
            name: 'codex-control',
            source: { source: 'local', path: './plugins/codex-control' },
            policy: {
              installation: 'AVAILABLE',
              authentication: 'ON_INSTALL',
            },
            category: 'Developer Tools',
          },
        ],
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await cp(
    join(scriptsRoot, 'native-plugin-container.mjs'),
    join(harnessRoot, 'native-plugin-container.mjs'),
  );
  await cp(
    join(scriptsRoot, 'native-plugin-entrypoint.sh'),
    join(harnessRoot, 'entrypoint.sh'),
  );

  const pluginEntries = (await readdir(stagedPlugin)).sort();
  if (
    JSON.stringify(pluginEntries) !==
    JSON.stringify([...allowedPluginEntries].sort())
  )
    throw new Error('BUILT_PLUGIN_PACKAGE_ALLOWLIST_VIOLATION');
  const digest = createHash('sha256');
  for (const file of await listFiles(marketplaceRoot)) {
    const contents = await readFile(join(marketplaceRoot, file));
    digest
      .update(file)
      .update('\0')
      .update(createHash('sha256').update(contents).digest());
  }
  return { marketplaceRoot, harnessRoot, packageDigest: digest.digest('hex') };
}

async function runProcess(
  command: string,
  arguments_: readonly string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, arguments_, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      rejectRun(error);
    };
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next) > 256 * 1024)
        throw new Error('GATE_OUTPUT_LIMIT_EXCEEDED');
      return next;
    };
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        stdout = append(stdout, chunk);
      } catch (error) {
        child.kill('SIGKILL');
        rejectOnce(error as Error);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      try {
        stderr = append(stderr, chunk);
      } catch (error) {
        child.kill('SIGKILL');
        rejectOnce(error as Error);
      }
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
      rejectOnce(new Error(`PROCESS_TIMEOUT:${command}`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectOnce(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolveRun({ stdout, stderr });
      else {
        const diagnostic = stderr
          .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
          .replace(/[A-Za-z0-9+/_=-]{32,}/g, '[REDACTED]')
          .trim()
          .slice(-4000);
        rejectRun(
          new Error(
            `PROCESS_FAILED:${command}:${code ?? signal}${diagnostic ? `:${diagnostic}` : ''}`,
          ),
        );
      }
    });
  });
}

async function cleanupContainer(containerName: string): Promise<void> {
  await runProcess('docker', ['rm', '--force', containerName], 10_000).catch(
    () => undefined,
  );
}

async function execute(options: NativeGateOptions): Promise<void> {
  if (options.tokenFile)
    await requireOwnerOnlyFile(options.tokenFile, 'LIVE_TOKEN');
  if (options.authFile)
    await requireOwnerOnlyFile(options.authFile, 'PAID_AUTH');
  const baseRevision = await runProcess('git', ['rev-parse', 'HEAD'], 10_000);
  const image = await runProcess(
    'docker',
    ['image', 'inspect', options.image, '--format', '{{.Id}}'],
    15_000,
  ).catch(() => {
    throw new Error(`LOCAL_IMAGE_PREREQUISITE_MISSING:${options.image}`);
  });
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'cas-native-plugin-gate-'),
  );
  const containerName = `cas-native-plugin-gate-${randomBytes(6).toString('hex')}`;
  try {
    const staged = await stageConsumer(temporaryRoot);
    const dockerArguments = buildDockerRunArguments(options, {
      containerName,
      marketplaceRoot: staged.marketplaceRoot,
      harnessRoot: staged.harnessRoot,
    });
    const gateTimeoutMs =
      options.mode === 'paid-agent'
        ? options.turnTimeoutMs + 90_000
        : options.rpcTimeoutMs * 8;
    const result = await withOwnedContainerCleanup(
      () => runProcess('docker', dockerArguments, gateTimeoutMs),
      () => cleanupContainer(containerName),
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.log(
      JSON.stringify({
        gate: 'cas-native-plugin-clean-install',
        mode: options.mode,
        baseRevision: baseRevision.stdout.trim(),
        image: options.image,
        imageId: image.stdout.trim(),
        packageSha256: staged.packageDigest,
        cleanup: 'owned-container-absent',
        status: 'passed',
      }),
    );
  } finally {
    await cleanupContainer(containerName);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) console.log(usage());
else await execute(parseNativeGateOptions(arguments_));
