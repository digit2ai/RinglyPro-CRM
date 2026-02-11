import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/tunjoracing/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  server: {
    port: 3001,
    proxy: {
      '/tunjoracing/api': {
        target: 'http://localhost:10000',
        changeOrigin: true
      }
    }
  }
});
