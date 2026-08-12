import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'packages/codex',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: false,
    reporters: ['default'],
    testTimeout: 10_000,
  },
});
