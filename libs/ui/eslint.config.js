import reactConfig from '@tooling/eslint/react';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...reactConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.json'],
      },
    },
    name: 'ui-typescript',
  },
]);
