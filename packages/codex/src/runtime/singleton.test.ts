import { afterEach, describe, expect, test } from 'vitest';

import {
  initializeCodexHost,
  resetCodexHostForTests,
  shutdownCodexHost,
  type CodexAdapter,
  type CodexAdapterFactory,
  type CodexAdapterThread,
  type CodexEvent,
  type CodexHostConfig,
  type CodexThreadRequest,
  type CodexTurnResult,
} from '../index.js';

// === L1: UNIT TESTS ===

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function adapterFactory(
  run: (request: CodexThreadRequest) => Promise<CodexTurnResult>,
  stream?: (request: CodexThreadRequest) => AsyncGenerator<CodexEvent>,
): CodexAdapterFactory {
  return () => {
    const thread: CodexAdapterThread = {
      id: 'fake-thread',
      run,
      stream:
        stream ??
        async function* () {
          yield { type: 'turn.started' } satisfies CodexEvent;
        },
    };
    return {
      startThread: () => thread,
      resumeThread: () => thread,
    } satisfies CodexAdapter;
  };
}

const completed: CodexTurnResult = {
  threadId: 'fake-thread',
  finalResponse: 'ok',
  events: [],
  usage: null,
};

afterEach(() => {
  resetCodexHostForTests();
});

describe('[L1:UNIT] Codex host singleton', () => {
  test('[L1:UNIT] CWF-AUD-001 snapshots and deeply freezes admitted configuration without secret-dependent identity', () => {
    let admitted: CodexHostConfig | undefined;
    const config: CodexHostConfig = {
      codexPathOverride: '/controlled/codex',
      baseUrl: 'https://host.invalid',
      apiKey: 'api-secret-before',
      config: {
        nested: { marker: 'before', credential: 'config-secret-before' },
      },
      env: { PATH: '/before/bin', SECRET_TOKEN: 'env-secret-before' },
    };
    const factory: CodexAdapterFactory = (candidate) => {
      admitted = candidate;
      return adapterFactory(async () => completed)(candidate);
    };
    const host = initializeCodexHost(config, factory);
    const fingerprint = host.diagnostics.fingerprint;

    const nested = config.config?.nested as Record<string, string>;
    const mutableEnv = config.env;
    if (!mutableEnv) throw new Error('test fixture requires an environment');
    nested.marker = 'after';
    mutableEnv.PATH = '/after/bin';
    config.apiKey = 'api-secret-after';

    expect(admitted).not.toBe(config);
    expect(admitted?.config).not.toBe(config.config);
    expect(admitted?.env).not.toBe(config.env);
    expect((admitted?.config?.nested as Record<string, string>).marker).toBe(
      'before',
    );
    expect(admitted?.env?.PATH).toBe('/before/bin');
    expect(admitted?.apiKey).toBe('api-secret-before');
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted?.config?.nested)).toBe(true);
    expect(Object.isFrozen(admitted?.env)).toBe(true);

    expect(() =>
      initializeCodexHost(
        {
          codexPathOverride: '/controlled/codex',
          baseUrl: 'https://host.invalid',
          apiKey: 'different-api-secret',
          config: {
            nested: {
              marker: 'different-arbitrary-value',
              credential: 'different-config-secret',
            },
          },
          env: {
            PATH: '/different/bin',
            SECRET_TOKEN: 'different-env-secret',
          },
        },
        factory,
      ),
    ).toThrowError('CODEX_HOST_CONFLICT');
    expect(host.diagnostics.fingerprint).toBe(fingerprint);
    expect(JSON.stringify(host.diagnostics)).not.toContain('secret');
  });

  test('[L1:UNIT] CWF2-AUD-001 reuses only full equivalent private admission and rejects every behavior-affecting difference', () => {
    const observer = () => undefined;
    const differentObserver = () => undefined;
    const factory = adapterFactory(async () => completed);
    const differentFactory = adapterFactory(async () => completed);
    const baseConfig: CodexHostConfig = {
      codexPathOverride: '/controlled/codex',
      baseUrl: 'https://host.invalid',
      apiKey: 'api-secret',
      config: {
        primitive: 'same',
        nested: { marker: 'same', child: { enabled: true } },
        array: ['same', { marker: 'same' }],
      },
      env: { PATH: '/controlled/bin', SECRET_TOKEN: 'env-secret' },
      observe: observer,
    };

    const first = initializeCodexHost(baseConfig, factory);
    const equivalent = initializeCodexHost(
      {
        codexPathOverride: '/controlled/codex',
        baseUrl: 'https://host.invalid',
        apiKey: 'api-secret',
        config: {
          array: ['same', { marker: 'same' }],
          nested: { child: { enabled: true }, marker: 'same' },
          primitive: 'same',
        },
        env: { SECRET_TOKEN: 'env-secret', PATH: '/controlled/bin' },
        observe: observer,
      },
      factory,
    );
    expect(equivalent).toBe(first);

    const conflicts: CodexHostConfig[] = [
      { ...baseConfig, codexPathOverride: '/different/codex' },
      { ...baseConfig, baseUrl: 'https://different.invalid' },
      { ...baseConfig, apiKey: 'different-api-secret' },
      {
        ...baseConfig,
        config: { ...baseConfig.config, primitive: 'different' },
      },
      {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          nested: { marker: 'different', child: { enabled: true } },
        },
      },
      {
        ...baseConfig,
        config: {
          ...baseConfig.config,
          array: ['same', { marker: 'different' }],
        },
      },
      {
        ...baseConfig,
        env: { PATH: '/different/bin', SECRET_TOKEN: 'env-secret' },
      },
      { ...baseConfig, env: { PATH: '/controlled/bin' } },
      { ...baseConfig, observe: differentObserver },
      {
        ...baseConfig,
        apiKey: 'combined-api-secret',
        config: { nested: { marker: 'combined' } },
        env: { DIFFERENT_KEY: 'combined-env-secret' },
      },
    ];

    for (const conflict of conflicts) {
      expect(() => initializeCodexHost(conflict, factory)).toThrowError(
        'CODEX_HOST_CONFLICT',
      );
    }
    expect(() =>
      initializeCodexHost(baseConfig, differentFactory),
    ).toThrowError('CODEX_HOST_CONFLICT');
  });

  test('[L1:UNIT] CWF2-AUD-001 keeps public diagnostics secret-independent while private admission rejects conflicts', () => {
    const firstObserver = () => undefined;
    const secondObserver = () => undefined;
    const first = initializeCodexHost(
      {
        codexPathOverride: '/controlled/codex',
        baseUrl: 'https://host.invalid',
        apiKey: 'first-api-secret',
        config: {
          nested: { credential: 'first-config-secret' },
          array: ['first-array-secret'],
        },
        env: { PATH: '/first/bin', SECRET_TOKEN: 'first-env-secret' },
        observe: firstObserver,
      },
      adapterFactory(async () => completed),
    );
    const firstDiagnostics = JSON.stringify(first.diagnostics);
    const firstFingerprint = first.diagnostics.fingerprint;
    resetCodexHostForTests();

    const second = initializeCodexHost(
      {
        codexPathOverride: '/controlled/codex',
        baseUrl: 'https://host.invalid',
        apiKey: 'second-api-secret',
        config: {
          nested: { credential: 'second-config-secret' },
          array: ['second-array-secret'],
        },
        env: { PATH: '/second/bin', SECRET_TOKEN: 'second-env-secret' },
        observe: secondObserver,
      },
      adapterFactory(async () => completed),
    );
    const secondDiagnostics = JSON.stringify(second.diagnostics);

    expect(second.diagnostics.fingerprint).toBe(firstFingerprint);
    for (const secret of [
      'first-api-secret',
      'first-config-secret',
      'first-array-secret',
      '/first/bin',
      'first-env-secret',
      'second-api-secret',
      'second-config-secret',
      'second-array-secret',
      '/second/bin',
      'second-env-secret',
    ]) {
      expect(firstDiagnostics).not.toContain(secret);
      expect(secondDiagnostics).not.toContain(secret);
    }
    expect(Object.isFrozen(second.diagnostics)).toBe(true);
    expect(Object.isFrozen(second.diagnostics.envKeys)).toBe(true);
    expect(Reflect.set(second.diagnostics.envKeys, '0', 'BYPASS')).toBe(false);
  });

  test('[L1:UNIT] CWF-AUD-001 keeps conflict authority private from deeply immutable diagnostics', () => {
    const factory = adapterFactory(async () => completed);
    const conflictingFingerprint = initializeCodexHost(
      { baseUrl: 'https://second.invalid', env: { PATH: '/bin' } },
      factory,
    ).diagnostics.fingerprint;
    resetCodexHostForTests();

    const first = initializeCodexHost(
      { baseUrl: 'https://first.invalid', env: { PATH: '/bin' } },
      factory,
    );
    expect(Object.isFrozen(first.diagnostics)).toBe(true);
    expect(Object.isFrozen(first.diagnostics.envKeys)).toBe(true);
    expect(
      Reflect.set(first.diagnostics, 'fingerprint', conflictingFingerprint),
    ).toBe(false);
    expect(Reflect.set(first.diagnostics.envKeys, '0', 'MUTATED')).toBe(false);
    expect(() =>
      initializeCodexHost(
        { baseUrl: 'https://second.invalid', env: { PATH: '/bin' } },
        factory,
      ),
    ).toThrowError('CODEX_HOST_CONFLICT');
  });

  test('[L1:UNIT] CDX-L1-001 reuses an equal immutable configuration and redacts secret values', () => {
    const config = {
      codexPathOverride: '/controlled/codex',
      apiKey: 'top-secret-key',
      env: { PATH: '/controlled/bin', SECRET_TOKEN: 'top-secret-env' },
    };
    const factory = adapterFactory(async () => completed);
    const first = initializeCodexHost(config, factory);
    const second = initializeCodexHost(
      { ...config, env: { ...config.env } },
      factory,
    );

    expect(second).toBe(first);
    expect(first.diagnostics.envKeys).toEqual(['PATH', 'SECRET_TOKEN']);
    expect(JSON.stringify(first.diagnostics)).not.toContain('top-secret');
    expect(first.diagnostics.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('[L1:UNIT] CDX-L1-001 rejects a conflicting second initialization', () => {
    const factory = adapterFactory(async () => completed);
    initializeCodexHost({ baseUrl: 'https://first.invalid' }, factory);
    expect(() =>
      initializeCodexHost({ baseUrl: 'https://second.invalid' }, factory),
    ).toThrowError('CODEX_HOST_CONFLICT');
  });

  test('[L1:UNIT] CDX-L1-001 drains active work before singleton shutdown', async () => {
    const gate = deferred<CodexTurnResult>();
    const host = initializeCodexHost(
      {},
      adapterFactory(() => gate.promise),
    );
    const turn = host.runTurn({ prompt: 'wait' }).catch(() => completed);
    await Promise.resolve();
    expect(host.metrics().activeOperations).toBe(1);

    let shutdownFinished = false;
    const shutdown = shutdownCodexHost().then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);
    gate.resolve(completed);
    await turn;
    await shutdown;
    expect(host.metrics().activeOperations).toBe(0);
  });

  test('[L1:UNIT] CDX-L1-001 refuses a test reset while work is active', async () => {
    const gate = deferred<CodexTurnResult>();
    const host = initializeCodexHost(
      {},
      adapterFactory(() => gate.promise),
    );
    const turn = host.runTurn({ prompt: 'wait' }).catch(() => completed);
    await Promise.resolve();
    expect(() => resetCodexHostForTests()).toThrowError('CODEX_HOST_ACTIVE');
    gate.resolve(completed);
    await turn;
  });
});
