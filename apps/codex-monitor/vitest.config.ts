import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'apps/codex-monitor',
  test: {
    environment: 'node',
    include: [
      'scripts/**/*.test.ts',
      'scripts/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
    ],
    passWithNoTests: false,
    reporters: ['default'],
    testTimeout: 15_000,
  },
});
