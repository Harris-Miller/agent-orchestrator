import { defineConfig } from 'tsdown';

const watching = process.argv.includes('--watch') || process.argv.includes('-w');

export default defineConfig({
  clean: !watching,
  deps: {
    neverBundle: ['vscode'],
  },
  dts: false,
  entry: {
    extension: 'src/extension.ts',
  },
  format: 'cjs',
  hash: false,
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
  tsconfig: 'tsconfig.vscode.json',
});
