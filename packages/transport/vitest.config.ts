import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
