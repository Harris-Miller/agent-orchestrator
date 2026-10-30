import { defineConfig } from 'oxlint';
import { base, vitest } from '@tooling/oxlint';

export default defineConfig({
  options: { typeAware: true },
  ignorePatterns: ['.repos/**', 'dist/**', 'graphify-out/**', '.agents/**', 'coverage/**'],
  overrides: [
    ...base(),
    vitest(),
    { files: ['src/**/*.{ts,tsx}'], env: { browser: true }, globals: { acquireVsCodeApi: 'readonly' } },
  ],
});
