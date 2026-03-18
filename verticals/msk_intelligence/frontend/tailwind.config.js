/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        msk: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc5ff',
          400: '#36a9ff',
          500: '#0c8ce9',
          600: '#006fc8',
          700: '#0058a2',
          800: '#044b86',
          900: '#0a3f6f',
          950: '#07284a'
        },
        dark: {
          50: '#f6f6f7',
          100: '#e2e3e5',
          200: '#c4c5ca',
          300: '#9fa1a9',
          400: '#7b7d87',
          500: '#61636d',
          600: '#4d4e57',
          700: '#3f4047',
          800: '#2a2b30',
          900: '#1a1b1f',
          950: '#111114'
        }
      }
    }
  },
  plugins: []
};
