/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// https://vitejs.dev/config/
export default defineConfig({
  // Served under https://aiagent.ringlypro.com/planea (RinglyPro CRM sub-path mount).
  base: '/planea/',
  plugins: [tailwindcss(), react(), legacy()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts'
  },
  server: {
    open: true,
    port: 4321
  }
})
