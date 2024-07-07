import config from '@epiijs/eslint-config';

export default [
  {
    ignores: [
      'eslint.config.mjs',
      'test/',
      'build/',
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