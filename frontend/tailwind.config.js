/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs pastels personnalisées
        'pastel-blue': {
          DEFAULT: '#dbeafe',
          text: '#1e40af',
        },
        'pastel-green': {
          DEFAULT: '#d1fae5',
          text: '#065f46',
        },
        'pastel-purple': {
          DEFAULT: '#e9d5ff',
          text: '#6b21a8',
        },
        'pastel-pink': {
          DEFAULT: '#fce7f3',
          text: '#be185d',
        },
        'pastel-yellow': {
          DEFAULT: '#fef3c7',
          text: '#92400e',
        },
        'pastel-orange': {
          DEFAULT: '#fed7aa',
          text: '#c2410c',
        },
        'pastel-red': {
          DEFAULT: '#fecaca',
          text: '#dc2626',
        },
        'pastel-cyan': {
          DEFAULT: '#cffafe',
          text: '#0e7490',
        },
        'pastel-indigo': {
          DEFAULT: '#e0e7ff',
          text: '#3730a3',
        },
        'pastel-lime': {
          DEFAULT: '#ecfccb',
          text: '#365314',
        },
        'pastel-emerald': {
          DEFAULT: '#d1fae5',
          text: '#047857',
        },
        'pastel-teal': {
          DEFAULT: '#ccfbf1',
          text: '#0f5132',
        },
        'pastel-sky': {
          DEFAULT: '#e0f2fe',
          text: '#0c4a6e',
        },
        'pastel-violet': {
          DEFAULT: '#f3e8ff',
          text: '#581c87',
        },
        'pastel-fuchsia': {
          DEFAULT: '#fae8ff',
          text: '#a21caf',
        },
        'pastel-rose': {
          DEFAULT: '#fff1f2',
          text: '#be123c',
        },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      }
    },
  },
  plugins: [],
};