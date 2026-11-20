import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/**
 * Self-contained Node bundles: the hub ships as a bundled resource of the desktop app (which lists `hub.mjs` and
 * `hub-launcher.mjs` only) and inside the VSIX (packaged `--no-dependencies`), so nothing may be resolved from
 * `node_modules` or from a sibling chunk at runtime. One build per entry, because entries built together share code
 * through extra chunks (`home.mjs`) that the desktop app would not ship. tsdown cleans `dist` before both builds.
 */
const base: UserConfig = {
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  dts: false,
  format: 'esm',
  hash: false,
  outDir: 'dist',
  outExtensions: () => ({ js: '.mjs' }),
  platform: 'node',
};

export default defineConfig([
  { ...base, entry: { 'hub-launcher': 'src/launcher.ts' } },
  { ...base, entry: { hub: 'src/main.ts' } },
]);
