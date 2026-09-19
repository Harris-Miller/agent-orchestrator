import globals from '@tooling/eslint/globals';
import reactConfig from '@tooling/eslint/react';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...reactConfig,
  globalIgnores(['dist']),
  {
    // project root + build scripts (not under src/)
    files: ['*.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'vscode-root',
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.vscode.json', 'tsconfig.webview.json', 'tsconfig.node.json'],
      },
    },
    name: 'vscode-typescript',
  },
  {
    files: ['src/**/*.ts', '!src/webview/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'vscode-node',
  },
  {
    files: ['src/webview/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        acquireVsCodeApi: 'readonly',
      },
    },
    name: 'vscode-webview',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              message: 'The vscode module is Extension Host only. Use acquireVsCodeApi() + postMessage in the webview.',
              name: 'vscode',
            },
          ],
        },
      ],
    },
  },
]);
