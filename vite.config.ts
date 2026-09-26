import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = `http://localhost:${process.env.SERVER_PORT || 3001}`;

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/socket.io': { target: API, ws: true },
      '/api': API,
    },
  },
});
