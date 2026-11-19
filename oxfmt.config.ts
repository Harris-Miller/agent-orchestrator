import { defineConfig } from 'oxfmt';

export default defineConfig({
  arrowParens: 'avoid',
  endOfLine: process.platform === 'win32' ? 'crlf' : 'lf',
  printWidth: 120,
  singleQuote: true,
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '.agents/**',
    '.repos/**',
    'graphify-out/**',
    'pnpm-lock.yaml',
    'apps/desktop/src/routeTree.gen.ts',
  ],
});
