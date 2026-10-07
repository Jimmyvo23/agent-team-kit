import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true },
  // During `vite` dev, forward the API to a running `npm run office` server.
  // changeOrigin: the office server only accepts its own Host (DNS-rebinding guard).
  server: { proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } } },
});
