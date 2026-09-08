import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectAppServer } from '@codex/codex';
import { expect, it } from 'vitest';
import { createAppServerHostRegistry } from '../app-server-host.registry.js';

it('[L2:INTEGRATION] local 0.153.2 preserves the control protocol without model turns', async () => {
  // macOS Unix socket paths must fit SUN_LEN, including the server's suffix.
  const home = await mkdtemp(
    join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'cas-local-0153-'),
  );
  const registry = createAppServerHostRegistry({
    connectAppServer,
    resolveCredential: async () => {
      throw new Error('NO_CREDENTIALS_ALLOWED');
    },
  });
  try {
    registry.register({
      hostId: 'compat',
      transport: 'local-proxy',
      codexHome: home,
      expectedVersion: '0.153.2',
    });
    const client = await registry.connect('compat');
    expect(client.diagnostics.serverVersion).toBe('0.153.2');
    expect(
      await client.request('fs/getMetadata', { path: home }),
    ).toMatchObject({ isDirectory: true, isSymlink: false });
    expect(
      await client.request('account/read', { refreshToken: false }),
    ).toHaveProperty('account');
    expect(
      await client.request('command/exec', {
        command: ['/usr/bin/true'],
        cwd: home,
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        timeoutMs: 5000,
      }),
    ).toMatchObject({ exitCode: 0, stdout: '', stderr: '' });
    const started = await client.request('thread/start', {
      cwd: home,
      ephemeral: true,
      model: 'gpt-6-astra',
      approvalPolicy: 'never',
      sandbox: 'read-only',
    });
    expect(started).toHaveProperty('thread.id');
    await client.reconnect();
    expect(
      await client.request('account/read', { refreshToken: false }),
    ).toHaveProperty('account');
  } finally {
    await registry.disable('compat');
    await rm(home, { recursive: true, force: true });
  }
});
