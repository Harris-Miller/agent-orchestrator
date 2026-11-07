import { defineConfig } from 'oxlint';
import { base, react, vitest } from '@tooling/oxlint';

export default defineConfig({
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**'],
  overrides: [...base(), react(), vitest()],
});
