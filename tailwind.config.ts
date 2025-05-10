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
      },
      fontFamily: {
        'press-start': ['"Press Start 2P"', 'cursive'],
      },
      keyframes: {
        rainbow: {
          '0%': { color: '#ff0000' },
          '17%': { color: '#ff8800' },
          '33%': { color: '#ffff00' },
          '50%': { color: '#00ff00' },
          '67%': { color: '#0000ff' },
          '83%': { color: '#8800ff' },
          '100%': { color: '#ff0000' },
        },
      },
      animation: {
        'rainbow': 'rainbow 3s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config 