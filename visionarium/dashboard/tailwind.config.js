/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0b1d4a', light: '#17296b', dark: '#030814', blk: '#010409' },
        teal: { DEFAULT: '#3dcbca', light: '#8eeae8', neon: '#2de8e6' },
        coral: { DEFAULT: '#ef6c57', neon: '#ff7a63', dark: '#c94a38' },
        gold: { DEFAULT: '#d4a574', neon: '#e8c896', dark: '#a07a4c' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
