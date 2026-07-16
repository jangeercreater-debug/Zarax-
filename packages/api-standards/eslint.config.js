module.exports = [
  ...require('@zarax/eslint-config/nestjs'),
  { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
];
