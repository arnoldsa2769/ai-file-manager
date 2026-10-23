import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.AFM_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/v1': `http://127.0.0.1:${process.env.AFM_PORT ?? 7310}` },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
