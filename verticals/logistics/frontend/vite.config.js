import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/logistics/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/logistics/api': 'http://localhost:10000' } }
});
