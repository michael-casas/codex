import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'apps/daemon-e2e',
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
