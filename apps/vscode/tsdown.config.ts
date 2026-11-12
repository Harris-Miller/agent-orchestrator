import { defineConfig } from 'tsdown';

const watching = process.argv.includes('--watch') || process.argv.includes('-w');

export default defineConfig({
  clean: !watching,
  // The MCP hub ships inside the VSIX at `hub/` (the `BundledResource` path both Hosts use); built by `@lib/hub#build`.
  copy: [{ from: '../../libs/hub/dist/*.mjs', to: 'hub' }],
  define: {
    // `watch:main` → Vite HMR HTML; `build:main` → disk IIFE assets.
    'process.env.WEBVIEW_HMR': JSON.stringify(watching ? '1' : '0'),
  },
  deps: {
    // The packaged `.vsix` ships without node_modules (`vsce --no-dependencies`), so everything but `vscode` is inlined.
    alwaysBundle: [/.*/],
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
