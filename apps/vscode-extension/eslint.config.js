import reactConfig from '@tooling/eslint/react';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...reactConfig,
  globalIgnores(['out', 'scripts', 'vite.config.ts', 'vite.webview.config.ts']),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    name: 'vscode-extension-host',
  },
  {
    files: ['src/webview/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.webview.json'],
      },
    },
    name: 'vscode-extension-webview',
  },
]);
