import { defineConfig, globalIgnores } from 'eslint/config';
import harrisConfigBase from 'eslint-config-harris/base';
import globals from 'eslint-config-harris/globals';
import harrisConfigVitest from 'eslint-config-harris/vitest';

const eslintConfig = defineConfig([
  ...harrisConfigBase,
  globalIgnores(['.repos', 'dist', 'graphify-out', '.agents', 'coverage']),
  {
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'project',
  },
  {
    rules: {},
  },
  {
    files: ['**/*.ts'],
    name: 'project-typescript',
    rules: {
      '@typescript-eslint/consistent-return': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Effect.fn("name")(function* () {}) is the idiomatic Effect v4 pattern
      'func-names': 'off',
      // it's common in effect to extend classes for errors and tags where many go in single files
      'max-classes-per-file': 'off',
      // temp
      'no-console': 'off',
    },
  },
  ...harrisConfigVitest,
  {
    files: ['**/*.test.ts'],
    name: 'project-vitest',
    rules: {
      // this is throwing a false positive because `describe` is imported from `@effect/vitest`
      'vitest/require-top-level-describe': 'off',
    },
    settings: {
      vitest: {
        typecheck: true,
      },
    },
  },
]);

export default eslintConfig;
