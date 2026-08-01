/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0a0a0a',
          800: '#141414',
          700: '#1a1a1a',
          600: '#242424',
          500: '#2a2a2a',
        },
        primary: {
          400: '#ffc107',
          500: '#ffb300',
          600: '#ffa000',
        },
        accent: {
          green: '#4caf50',
          red: '#f44336',
          blue: '#2196f3',
          purple: '#9c27b0',
        },
      },
    },
  },
  plugins: [],
};
