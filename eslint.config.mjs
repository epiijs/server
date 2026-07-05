import config from '@epiijs/eslint-config';

export default [
  {
    ignores: [
      'eslint.config.mjs',
      'vitest.config.ts',
      'test/',
      'build/',
      'coverage/',
      'node_modules/'
    ]
  },
  ...config,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/object-curly-newline': ['error', {
        ImportDeclaration: { minProperties: 2, consistent: true },
        ExportDeclaration: { minProperties: 2, consistent: true }
      }]
    }
  }
];