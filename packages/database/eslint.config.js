module.exports = [
  ...require('@zarax/eslint-config/base'),
  { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
];
