import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Torna_Idioma/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/Torna_Idioma/api': 'http://localhost:10000' } }
});
