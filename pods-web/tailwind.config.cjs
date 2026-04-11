/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0a1e42',
        'orange-pods': '#e95422',
      },
    },
  },
  plugins: [],
};

