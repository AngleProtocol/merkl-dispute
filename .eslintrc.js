module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'simple-import-sort'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier', 'plugin:prettier/recommended'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 1 }],
    'max-len': [
      'error',
      {
        code: 180,
        ignoreComments: true,
        ignoreTrailingComments: true,
        ignoreStrings: true,
      },
    ],
  },
};
