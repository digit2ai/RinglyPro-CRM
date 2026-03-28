import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/msk/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['@mediapipe/tasks-vision']
    }
  },
  server: {
    proxy: {
      '/msk/api': 'http://localhost:10000'
    }
  }
});
