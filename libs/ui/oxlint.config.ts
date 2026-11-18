import { defineConfig } from 'oxlint';
import { base, react, vitest } from '@tooling/oxlint';

export default defineConfig({
  categories: { correctness: 'off' },
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**'],
  overrides: [...base(), react(), vitest()],
});
