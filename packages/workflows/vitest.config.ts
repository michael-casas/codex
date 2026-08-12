import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'packages/workflows',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
    reporters: ['default'],
  },
});
