import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rendererPort = Number.parseInt(process.env.DHD_WORKBENCH_PORT ?? '5173', 10)

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: Number.isSafeInteger(rendererPort) && rendererPort > 0 && rendererPort < 65536 ? rendererPort : 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['monaco-editor', '@xterm/xterm'],
  },
})
