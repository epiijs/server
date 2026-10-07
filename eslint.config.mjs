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
    }
  }
];
