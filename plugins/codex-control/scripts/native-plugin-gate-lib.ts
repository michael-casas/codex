import { resolve } from 'node:path';

export type NativeGateMode = 'smoke' | 'live' | 'paid-agent';

export interface NativeGateOptions {
  mode: NativeGateMode;
  image: string;
  tokenFile?: string;
  authFile?: string;
  actorAgentId: string;
  backendPort: number;
  rpcTimeoutMs: number;
  turnTimeoutMs: number;
}

export interface ObservedToolCall {
  server?: string;
  tool?: string;
  status?: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error('INVALID_POSITIVE_INTEGER');
  return parsed;
}

function flagValue(
  arguments_: readonly string[],
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  const value = arguments_.find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length);
}

export function parseNativeGateOptions(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): NativeGateOptions {
  const supported = new Set([
    '--help',
    '--live',
    '--paid-agent',
    '--image',
    '--backend-port',
    '--rpc-timeout-ms',
    '--turn-timeout-ms',
  ]);
  for (const argument of arguments_) {
    const name = argument.split('=', 1)[0];
    if (!supported.has(name)) throw new Error(`UNKNOWN_ARGUMENT:${name}`);
  }
  const paid = arguments_.includes('--paid-agent');
  const live = paid || arguments_.includes('--live');
  const tokenFile = environment['CAS_NATIVE_PLUGIN_TOKEN_FILE'];
  const authFile = environment['CAS_NATIVE_PLUGIN_AUTH_FILE'];
  if (live && !tokenFile) throw new Error('LIVE_TOKEN_FILE_REQUIRED');
  if (paid && !authFile) throw new Error('PAID_AUTH_FILE_REQUIRED');
  const image =
    flagValue(arguments_, '--image') ??
    environment['CAS_NATIVE_PLUGIN_IMAGE'] ??
    'cas-nextjs-dogfood-app-server:latest';
  if (!image || image.startsWith('-') || /\s/.test(image))
    throw new Error('INVALID_IMAGE_REFERENCE');
  return {
    mode: paid ? 'paid-agent' : live ? 'live' : 'smoke',
    image,
    tokenFile: tokenFile ? resolve(tokenFile) : undefined,
    authFile: authFile ? resolve(authFile) : undefined,
    actorAgentId:
      environment['CAS_NATIVE_PLUGIN_ACTOR_AGENT_ID'] ??
      'cas-native-plugin-gate',
    backendPort: positiveInteger(
      flagValue(arguments_, '--backend-port') ??
        environment['CAS_NATIVE_PLUGIN_BACKEND_PORT'],
      4765,
    ),
    rpcTimeoutMs: positiveInteger(
      flagValue(arguments_, '--rpc-timeout-ms') ??
        environment['CAS_NATIVE_PLUGIN_RPC_TIMEOUT_MS'],
      15_000,
    ),
    turnTimeoutMs: positiveInteger(
      flagValue(arguments_, '--turn-timeout-ms') ??
        environment['CAS_NATIVE_PLUGIN_TURN_TIMEOUT_MS'],
      120_000,
    ),
  };
}

export function assertReadOnlyToolCalls(
  calls: readonly ObservedToolCall[],
): void {
  if (
    calls.length !== 1 ||
    calls[0]?.server !== 'codex-control' ||
    calls[0]?.tool !== 'get_control_snapshot' ||
    calls[0]?.status !== 'completed'
  )
    throw new Error('READ_ONLY_TOOL_ALLOWLIST_VIOLATION');
}

export function buildDockerRunArguments(
  options: NativeGateOptions,
  paths: {
    containerName: string;
    marketplaceRoot: string;
    harnessRoot: string;
  },
): string[] {
  const arguments_ = [
    'run',
    '--rm',
    '--init',
    '--read-only',
    '--name',
    paths.containerName,
    '--network',
    options.mode === 'smoke' ? 'none' : 'bridge',
    '--tmpfs',
    '/home/codex/.codex:uid=1100,gid=1100,mode=0700',
    '--tmpfs',
    '/workspace:uid=1100,gid=1100,mode=0700',
    '--tmpfs',
    '/tmp:uid=1100,gid=1100,mode=1777',
    '--mount',
    `type=bind,src=${paths.marketplaceRoot},dst=/market,readonly`,
    '--mount',
    `type=bind,src=${paths.harnessRoot},dst=/opt/cas-native-plugin-gate,readonly`,
    '--env',
    'CODEX_HOME=/home/codex/.codex',
    '--env',
    `CAS_NATIVE_PLUGIN_MODE=${options.mode}`,
    '--env',
    `CAS_NATIVE_PLUGIN_RPC_TIMEOUT_MS=${options.rpcTimeoutMs}`,
    '--env',
    `CAS_NATIVE_PLUGIN_TURN_TIMEOUT_MS=${options.turnTimeoutMs}`,
    '--entrypoint',
    '/opt/cas-native-plugin-gate/entrypoint.sh',
  ];
  if (options.mode !== 'smoke') {
    arguments_.push(
      '--add-host',
      'host.docker.internal:host-gateway',
      '--mount',
      `type=bind,src=${options.tokenFile},dst=/mnt/cas-native-plugin-secrets/token,readonly`,
      '--env',
      'CODEX_CONTROL_ORIGIN=http://127.0.0.1:4765',
      '--env',
      'CODEX_CONTROL_TOKEN_FILE=/home/codex/.codex/control-token',
      '--env',
      `CODEX_CONTROL_ACTOR_AGENT_ID=${options.actorAgentId}`,
      '--env',
      `CAS_NATIVE_PLUGIN_BACKEND_PORT=${options.backendPort}`,
    );
  }
  if (options.mode === 'paid-agent')
    arguments_.push(
      '--mount',
      `type=bind,src=${options.authFile},dst=/mnt/cas-native-plugin-secrets/auth.json,readonly`,
    );
  arguments_.push(options.image);
  return arguments_;
}

export async function withOwnedContainerCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  try {
    return await run();
  } finally {
    await cleanup();
  }
}
