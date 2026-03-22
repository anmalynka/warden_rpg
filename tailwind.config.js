/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          light: '#3d7a35',
          DEFAULT: '#2d5a27',
          dark: '#1d3a19',
        },
        earthy: {
          light: '#7d5a4d',
          DEFAULT: '#5d4037',
          dark: '#3d2a23',
        },
        aether: {
          DEFAULT: '#00d4ff',
        }
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'], // Common pixel font, or just use 'pixel'
      },
    },
  },
  plugins: [],
}
