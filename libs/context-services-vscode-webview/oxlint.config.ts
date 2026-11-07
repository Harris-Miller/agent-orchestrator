import { defineConfig } from 'oxlint';
import { base, vitest } from '@tooling/oxlint';

export default defineConfig({
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**'],
  overrides: [
    ...base(),
    vitest(),
    { files: ['src/**/*.{ts,tsx}'], env: { browser: true }, globals: { acquireVsCodeApi: 'readonly' } },
  ],
});
