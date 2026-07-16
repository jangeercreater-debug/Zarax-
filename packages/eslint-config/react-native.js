// @ts-check
const reactConfig = require('./react');

/**
 * Extend from apps/mobile:
 *   module.exports = [
 *     ...require('@zarax/eslint-config/react-native'),
 *     { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
 *   ];
 */
module.exports = [
  ...reactConfig,
  {
    rules: {
      // RN's <Text>/style-prop conventions trip up some generic React rules; relax narrowly.
      'react/no-unknown-property': 'off',
    },
  },
];
