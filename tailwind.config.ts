import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAF8',
        card: '#FFFFFF',
        border: '#E8E6E1',
        text: '#1A1A1A',
        sub: '#6B6B6B',
        muted: '#A0A0A0',
        green: { DEFAULT: '#2D8C4E', light: '#E8F5ED', dark: '#1E6B38' },
        blue: { DEFAULT: '#3478F6', light: '#EBF2FF' },
        orange: { DEFAULT: '#E67E22', light: '#FFF3E6' },
        red: { DEFAULT: '#E74C3C', light: '#FDEDEC' },
        yellow: { DEFAULT: '#F4C542', light: '#FFF9E6' },
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'DM Sans', 'sans-serif'],
        mono: ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.06)',
        lg: '0 8px 32px rgba(0,0,0,0.10)',
      },
      animation: {
        slideUp: 'slideUp 0.3s ease',
      },
      keyframes: {
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
