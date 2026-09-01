import globals from '@tooling/eslint/globals';
import baseReactConfig from '@tooling/eslint/react';
import { defineConfig, globalIgnores } from 'eslint/config';

const config = defineConfig([
  ...baseReactConfig,
  globalIgnores(['src-tauri']),
  {
    // this is only files at the project root, _not_ in src/
    files: ['*.ts'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'desktop-node',
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.app.json', 'tsconfig.node.json'],
      },
    },
    name: 'desktop-typescript',
  },
  {
    files: ['src/routes/**/*.{ts,tsx}'],
    name: 'desktop-tanstack-router-routes',
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          extraHOCs: ['createFileRoute', 'createRootRoute'],
        },
      ],
    },
  },
]);

export default config;
