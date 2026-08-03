/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      keyframes: {
        'dot-pulse': {
          '0%, 100%': { transform: 'scale(0.6)', opacity: '0.5' },
          '50%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'dot-pulse': 'dot-pulse 1s ease-in-out infinite',
      },
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
