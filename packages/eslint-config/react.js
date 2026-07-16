// @ts-check
const baseConfig = require('./base');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

/**
 * Extend from apps/web:
 *   module.exports = [
 *     ...require('@zarax/eslint-config/react'),
 *     { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
 *   ];
 */
module.exports = [
  ...baseConfig,
  {
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Next.js automatic JSX runtime
      'react/prop-types': 'off', // TypeScript covers this
    },
  },
];
