import { defineConfig } from 'oxlint';
import { base, node, react, vitest } from '@tooling/oxlint';

export default defineConfig({
  options: { typeAware: true },
  ignorePatterns: [
    '.repos/**',
    'dist/**',
    'graphify-out/**',
    '.agents/**',
    'coverage/**',
    'src-tauri/**',
    'src/routeTree.gen.ts',
  ],
  overrides: [...base(), react(), node(), vitest()],
});
