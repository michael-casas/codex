import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import initGenerator from './generator.js';

const path = '.agents/plugins/marketplace.json';
const read = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>) => {
  const value = tree.read(path, 'utf8');
  if (value === null) throw new Error('MARKETPLACE_MISSING');
  return value;
};

describe('[L1:DOMAIN] codex-control init generator', () => {
  it('creates the repo marketplace and is byte-idempotent', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await initGenerator(tree);
    const first = read(tree);
    await initGenerator(tree);

    expect(read(tree)).toBe(first);
    expect(JSON.parse(first)).toMatchObject({
      name: 'codex-control-local',
      plugins: [
        {
          name: 'codex-control',
          source: { source: 'local', path: './plugins/codex-control' },
        },
      ],
    });
  });

  it('preserves unrelated entries and rejects malformed input without write', async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      path,
      JSON.stringify({ name: 'existing', plugins: [{ name: 'other' }] }),
    );
    await initGenerator(tree);
    expect(JSON.parse(read(tree)).plugins).toEqual([
      { name: 'other' },
      expect.objectContaining({ name: 'codex-control' }),
    ]);

    const malformed = createTreeWithEmptyWorkspace();
    malformed.write(path, '{"name":"broken"}');
    const before = read(malformed);
    await expect(initGenerator(malformed)).rejects.toThrow(
      'CODEX_CONTROL_MARKETPLACE_INVALID',
    );
    expect(read(malformed)).toBe(before);
  });
});
