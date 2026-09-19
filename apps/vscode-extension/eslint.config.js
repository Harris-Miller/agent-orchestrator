import globals from '@tooling/eslint/globals';
import reactConfig from '@tooling/eslint/react';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...reactConfig,
  globalIgnores(['dist']),
  {
    // this is only files at the project root, _not_ in src/
    files: ['*.ts'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'vscode-extension-root',
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.vscode.json', 'tsconfig.webview.json', 'tsconfig.node.json'],
      },
    },
    name: 'vscode-extension-typescript',
  },
  {
    files: ['src/**/*.ts', '!src/webview/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    name: 'vscode-extension-node',
  },
  {
    files: ['src/webview/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    name: 'vscode-extension-webview',
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
