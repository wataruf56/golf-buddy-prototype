import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // === レトロ・ティール配色（モックCの色合いを本体に採用。色のみ変更） ===
        bg: '#E7F2EC',
        card: '#FBF7EC',
        border: '#D8E6DD',
        text: '#1E3A30',
        sub: '#5E7A6C',
        muted: '#9DB3A8',
        // 主役カラー（旧green=ブランド）→ ティール
        green: { DEFAULT: '#2A8C82', light: '#DCEFEA', dark: '#1F6D63' },
        blue: { DEFAULT: '#3478F6', light: '#EBF2FF' },
        // アクセント
        orange: { DEFAULT: '#E8643C', light: '#FCE6DD' },
        red: { DEFAULT: '#E74C3C', light: '#FDEDEC' },
        yellow: { DEFAULT: '#E8A93C', light: '#FBF0D6' },
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
