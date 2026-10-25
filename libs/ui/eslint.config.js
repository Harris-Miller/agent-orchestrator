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
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    name: 'ui-vendored-base-vega',
    rules: {
      // Registry files export variants and toast managers next to components.
      'react-refresh/only-export-components': 'off',
    },
  },
]);
