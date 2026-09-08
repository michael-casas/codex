import baseConfig from '../../eslint.config.mjs';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default [
  ...baseConfig,
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
];
