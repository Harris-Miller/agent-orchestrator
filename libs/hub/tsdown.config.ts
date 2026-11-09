import { defineConfig } from 'tsdown';

/**
 * Self-contained Node bundles: the hub ships as a bundled resource of the desktop app and inside the VSIX (packaged
 * `--no-dependencies`), so nothing may be resolved from `node_modules` at runtime.
 */
export default defineConfig({
  deps: {
    alwaysBundle: [/.*/],
  },
  dts: false,
  entry: {
    'hub-launcher': 'src/launcher.ts',
    hub: 'src/main.ts',
  },
  format: 'esm',
  hash: false,
  outDir: 'dist',
  outExtensions: () => ({ js: '.mjs' }),
  platform: 'node',
});
