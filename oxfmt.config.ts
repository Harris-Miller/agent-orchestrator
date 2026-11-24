import { defineConfig } from 'oxfmt';

export default defineConfig({
  arrowParens: 'avoid',
  endOfLine: process.platform === 'win32' ? 'crlf' : 'lf',
  printWidth: 120,
  singleQuote: true,
  ignorePatterns: [
    '.agents/skills/**',
    '.claude/skills/**',
    'apps/desktop/src/routeTree.gen.ts',
    '**/.vitepress/cache/**',
  ],
});
