import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEBVIEW_VITE_ORIGIN, WEBVIEW_VITE_PORT } from './src/webviewDevServer.ts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// The repo-root `package.json` is the version source of truth.
const rootVersion = (JSON.parse(readFileSync(path.join(rootDir, '../../package.json'), 'utf8')) as { version?: string })
  .version;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  return {
    build: {
      emptyOutDir: !process.argv.includes('--watch'),
      lib: {
        entry: path.join(rootDir, 'src/webview/index.tsx'),
        fileName: () => 'main.js',
        formats: ['iife'],
        name: 'HoaWebview',
      },
      minify: mode === 'production',
      outDir: 'dist/webview',
      rolldownOptions: {
        output: {
          // Keep CSS name stable so sidebarViewProvider can link it.
          assetFileNames: 'main[extname]',
        },
      },
      sourcemap: true,
    },
    define: {
      'process.env.HOA_ANTIGRAVITY_BETA': JSON.stringify(env.HOA_ANTIGRAVITY_BETA || ''),
      'process.env.HOA_APP_VERSION': JSON.stringify(rootVersion ?? 'unknown'),
      'process.env.HOA_BUILD_TARGET': JSON.stringify(mode === 'development' ? 'dev' : 'prod'),
      'process.env.HOA_CURSOR_BETA': JSON.stringify(env.HOA_CURSOR_BETA || ''),
      'process.env.POSTHOG_PROJECT_TOKEN': JSON.stringify(env.POSTHOG_PROJECT_TOKEN || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    // Prebundle at server start so the first webview client does not trigger
    // "optimized dependencies changed. reloading" — that full reload wipes VS Code's
    // document.write into fake.html and leaves a blank sidebar.
    optimizeDeps: {
      entries: ['src/webview/index.tsx'],
    },
    plugins: [react()],
    server: {
      cors: true,
      origin: WEBVIEW_VITE_ORIGIN,
      port: WEBVIEW_VITE_PORT,
      strictPort: true,
    },
  };
});
