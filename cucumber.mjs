export default {
  import: ['packages/testing/src/**/*.steps.ts'],
  paths: ['packages/testing/src/**/*.feature'],
  format: ['progress', 'json:test-output/cucumber/ground-zero.json'],
};
