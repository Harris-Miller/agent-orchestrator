import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    emptyOutDir: !process.argv.includes('--watch'),
    lib: {
      entry: path.join(rootDir, 'src/extension.ts'),
      fileName: () => 'extension.cjs',
      formats: ['cjs'],
    },
    minify: false,
    outDir: 'out',
    rollupOptions: {
      external: ['vscode'],
    },
    sourcemap: true,
  },
})
