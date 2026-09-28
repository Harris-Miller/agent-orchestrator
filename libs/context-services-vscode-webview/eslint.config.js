import config from '@tooling/eslint';
import globals from '@tooling/eslint/globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...config,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        acquireVsCodeApi: 'readonly',
      },
    },
    name: 'context-services-vscode-webview-browser',
  },
]);
