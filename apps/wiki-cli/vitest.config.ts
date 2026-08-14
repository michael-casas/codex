import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'apps/wiki-cli',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    testTimeout: 15_000,
  },
});
