import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// This app's `package.json` version: `0.0.0` in dev; release CI sets the computed version before it builds.
const appVersion = (JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as { version?: string })
  .version;
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  return {
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,

    define: {
      'process.env.HOA_ANTIGRAVITY_BETA': JSON.stringify(env.HOA_ANTIGRAVITY_BETA || ''),
      'process.env.HOA_APP_VERSION': JSON.stringify(appVersion ?? 'unknown'),
      'process.env.HOA_BUILD_TARGET': JSON.stringify(mode === 'development' ? 'dev' : 'prod'),
      'process.env.HOA_CURSOR_BETA': JSON.stringify(env.HOA_CURSOR_BETA || ''),
      'process.env.POSTHOG_PROJECT_TOKEN': JSON.stringify(
        mode === 'development' ? env.POSTHOG_PROJECT_TOKEN || '' : '',
      ),
    },

    // TanStack Router must precede React so route modules get HMR instead of Fast Refresh rejecting `Route`
    plugins: [tanstackRouter({ autoCodeSplitting: false, target: 'react' }), react()],
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      hmr:
        host != null
          ? {
              host,
              port: 1421,
              protocol: 'ws',
            }
          : undefined,
      host: host ?? false,
      port: 1420,
      strictPort: true,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri` and the ACP adapter resource tree
        ignored: ['**/src-tauri/**'],
      },
    },
  };
});
