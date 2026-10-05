import { defineConfig } from 'tsdown';

/** Bundle adapter entry + workspace deps into a single Node ESM file for the resource tree. */
export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
  dts: false,
  entry: {
    index: 'src/main.ts',
  },
  format: 'esm',
  hash: false,
  outDir: 'dist',
  platform: 'node',
  shims: true,
  sourcemap: false,
});
