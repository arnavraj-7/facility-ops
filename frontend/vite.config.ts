import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Proxy the API in dev so the browser sees a single origin and the session
    // cookie flows without any cross-site cookie gymnastics.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
});
