import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/transport/src/**/*.test.ts',
      'packages/transport/src/**/*.spec.ts',
    ],
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
