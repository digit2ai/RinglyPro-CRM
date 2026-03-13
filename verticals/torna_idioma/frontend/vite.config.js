import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/torna-idioma/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/torna-idioma/api': 'http://localhost:10000' } }
});
