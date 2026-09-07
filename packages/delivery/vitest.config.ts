import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@codex/db/testing',
        replacement: fileURLToPath(
          new URL('../db/src/testing.ts', import.meta.url),
        ),
      },
      {
        find: '@codex/db',
        replacement: fileURLToPath(
          new URL('../db/src/index.ts', import.meta.url),
        ),
      },
      {
        find: '@codex/process',
        replacement: fileURLToPath(
          new URL('../process/src/index.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
