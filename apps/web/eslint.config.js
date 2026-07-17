module.exports = [
  ...require('@zarax/eslint-config/react'),
  { languageOptions: { parserOptions: { project: './tsconfig.json' } } },
  { rules: { '@typescript-eslint/explicit-function-return-type': 'off' } },
];
