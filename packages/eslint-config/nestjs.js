// @ts-check
const baseConfig = require('./base');

/**
 * Extend from apps/services using Nest:
 *   module.exports = [
 *     ...require('@zarax/eslint-config/nestjs'),
 *     { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
 *   ];
 */
module.exports = [
  ...baseConfig,
  {
    rules: {
      // Nest modules/controllers are frequently class-based with decorator-only bodies.
      '@typescript-eslint/no-extraneous-class': 'off',
      // DI-injected properties are assigned by the framework, not the constructor body.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
    },
  },
];
