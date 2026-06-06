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
        // ネオブルータリズム調：枠線は濃いインク色（モックCの作り）
        border: '#1E3A30',
        // 内部の薄い区切り線が必要な箇所用に淡色も残す
        hair: '#D8E6DD',
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
        // モックC：本文は丸ゴシック、数字・アクセントは Baloo 2
        sans: ['Zen Maru Gothic', 'Noto Sans JP', 'sans-serif'],
        mono: ['Baloo 2', 'Zen Maru Gothic', 'sans-serif'],
      },
      borderWidth: {
        // 既定の枠線を太く（ポップ/ブルータリズム調）
        DEFAULT: '2px',
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        // ハードシャドウ（ぼかし無し・カチッとずらす）
        card: '4px 4px 0 #1E3A30',
        lg: '6px 6px 0 #1E3A30',
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
