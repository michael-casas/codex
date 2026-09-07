import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'apps/daemon',
  resolve: {
    alias: [
      {
        find: '@codex/workflows/source',
        replacement: resolve(
          'packages/workflows/src/infrastructure/workflow-source/index.ts',
        ),
      },
      {
        find: '@codex/db/testing',
        replacement: resolve('packages/db/src/testing.ts'),
      },
      {
        find: '@codex/codex',
        replacement: resolve('packages/codex/src/index.ts'),
      },
      {
        find: '@codex/db',
        replacement: resolve('packages/db/src/index.ts'),
      },
      {
        find: '@codex/delivery',
        replacement: resolve('packages/delivery/src/index.ts'),
      },
      {
        find: '@codex/process',
        replacement: resolve('packages/process/src/index.ts'),
      },
      {
        find: '@codex/workflows',
        replacement: resolve('packages/workflows/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: false,
  },
});
