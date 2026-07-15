import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'apps/daemon',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
  },
});
