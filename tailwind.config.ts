import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'cyber-blue': '#00f0ff',
        'cyber-pink': '#ff00ff',
        'cyber-purple': '#9d00ff',
        'cyber-yellow': '#ffd700',
        'cyber-black': '#0a0a0a',
        'cyber-red': '#ff0000',
      },
      fontFamily: {
        'press-start': ['"Press Start 2P"', 'cursive'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in',
        'fade-out': 'fadeOut 0.5s ease-out',
        'damage-number': 'damageNumber 1s ease-out forwards',
        'pulse': 'pulse 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        damageNumber: {
          '0%': { 
            opacity: '1',
            transform: 'translate(0, 0)',
          },
          '100%': { 
            opacity: '0',
            transform: 'translate(var(--tw-translate-x), calc(var(--tw-translate-y) - 50px))',
          },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
}

export default config 