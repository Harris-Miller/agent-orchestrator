import { defineConfig } from 'oxlint';
import { base, node, vitest } from '@tooling/oxlint';

export default defineConfig({
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**'],
  overrides: [...base(), node(), vitest()],
});
