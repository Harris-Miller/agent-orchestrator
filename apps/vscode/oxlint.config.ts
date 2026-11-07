import { defineConfig } from 'oxlint';
import { base, node, react, vitest } from '@tooling/oxlint';

export default defineConfig({
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**', 'src/**/__tests__/**'],
  overrides: [
    ...base(),
    react(),
    node(),
    vitest(),
    {
      files: ['*.ts', 'scripts/**/*.js', 'src/**/*.ts', '!src/webview/**/*.{ts,tsx}'],
      env: { node: true },
      rules: { 'eslint/no-console': 'off' },
    },
    {
      files: ['src/webview/**/*.{ts,tsx}'],
      env: { browser: true },
      globals: { acquireVsCodeApi: 'readonly' },
      rules: {
        'eslint/no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'vscode',
                message:
                  'The vscode module is Extension Host only. Use acquireVsCodeApi() + postMessage in the webview.',
              },
            ],
          },
        ],
      },
    },
  ],
});
