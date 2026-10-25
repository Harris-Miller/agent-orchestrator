import { themePaintBootScript } from '@lib/ui/theme-paint-boot';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,

  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'theme-paint-boot',
      transformIndexHtml: {
        handler(html) {
          const script = `<script>${themePaintBootScript}</script>`;
          if (html.includes(script)) {
            return html;
          }
          return html.replace('<head>', `<head>\n    ${script}`);
        },
        order: 'post',
      },
    },
  ],
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
      ignored: ['**/src-tauri/**', '**/acp-adapter-resources/**'],
    },
  },
}));
