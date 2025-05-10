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
        'cyber-black': '#000000',
        'cyber-gray': '#1a1a1a',
        'cyber-light-gray': '#333333',
        'cyber-lighter-gray': '#4a4a4a',
        'cyber-white': '#ffffff',
        'cyber-blue': '#00ffff',
        'cyber-pink': '#ff00ff',
        'cyber-yellow': '#ffff00',
        'cyber-green': '#00ff00',
        'cyber-red': '#ff0000',
      },
      fontFamily: {
        'press-start': ['"Press Start 2P"', 'cursive'],
      },
      animation: {
        'rainbow': 'rainbow 3s linear infinite',
      },
      keyframes: {
        rainbow: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
}

export default config 