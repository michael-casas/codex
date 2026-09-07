import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'plugins/codex-control',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    passWithNoTests: false,
  },
});
