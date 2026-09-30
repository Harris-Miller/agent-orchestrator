import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEBVIEW_VITE_ORIGIN, WEBVIEW_VITE_PORT } from './src/webviewDevServer.ts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: !process.argv.includes('--watch'),
    lib: {
      entry: path.join(rootDir, 'src/webview/index.tsx'),
      fileName: () => 'main.js',
      formats: ['iife'],
      name: 'AgentOrchestratorWebview',
    },
    minify: mode === 'production',
    outDir: 'dist/webview',
    rollupOptions: {
      output: {
        // Keep CSS name stable so sidebarViewProvider can link it.
        assetFileNames: 'main[extname]',
      },
    },
    sourcemap: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  plugins: [react()],
  server: {
    cors: true,
    origin: WEBVIEW_VITE_ORIGIN,
    port: WEBVIEW_VITE_PORT,
    strictPort: true,
  },
}));
