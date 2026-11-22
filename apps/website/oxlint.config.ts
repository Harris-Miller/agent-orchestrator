import { defineConfig } from 'oxlint';
import { base, node } from '@tooling/oxlint';

export default defineConfig({
  categories: { correctness: 'off' },
  ignorePatterns: ['dist/**', '**/.vitepress/cache/**'],
  overrides: [
    ...base(),
    node(),
    // Ambient declarations must stay scripts, not modules.
    { files: ['**/*.d.ts'], plugins: ['import'], rules: { 'import/unambiguous': 'off' } },
  ],
});
