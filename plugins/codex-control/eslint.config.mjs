import nx from '@nx/eslint-plugin';
import jsonParser from 'jsonc-eslint-parser';

import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/package.json', '**/generators.json'],
    languageOptions: { parser: jsonParser },
    plugins: { '@nx': nx },
    rules: { '@nx/nx-plugin-checks': 'error' },
  },
];
