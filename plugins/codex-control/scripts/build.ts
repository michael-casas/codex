import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(pluginRoot, 'dist');
await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, 'nx'), { recursive: true });
await build({
  entryPoints: [join(pluginRoot, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(outputRoot, 'server.mjs'),
});
await build({
  entryPoints: [join(pluginRoot, 'src/generators/init/generator.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['@nx/devkit'],
  outfile: join(outputRoot, 'nx/init.cjs'),
});
