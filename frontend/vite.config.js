import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
