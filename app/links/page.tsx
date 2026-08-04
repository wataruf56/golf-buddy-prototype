import type { Metadata } from 'next';
import { HubLinks } from '@/components/HubLinks';

// Instagram の link-in-bio 用ハブ。プロフィールに貼れるリンクは1つだけなので、
// ここから「ゴルフMBTI（診断）」と「ラウンド募集一覧」の2つへ振り分ける。
// app.goltomo.com/links で公開（未ログインで閲覧可・アプリ枠なし）。
export const metadata: Metadata = {
  title: 'ゴルフMBTI | ゴルトモ',
  description: '無料のゴルフ版MBTI（16タイプ性格診断）と、いま募集中のゴルフラウンド一覧。ゴルフ仲間を見つけよう。',
};

const CREAM = '#FBF7EC';
const INK = '#1E3A30';

export default function LinksHubPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: `radial-gradient(#D3E4DA 1.5px, transparent 1.6px) 0 0 / 22px 22px, #E7F2EC`,
        fontFamily: "'Zen Maru Gothic','Noto Sans JP',sans-serif",
      }}
      className="flex flex-col items-center px-6 py-10"
    >
      <div className="w-full max-w-[440px] flex flex-col items-center">
        {/* ブランドチップ */}
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 mb-6 text-[13px] font-bold"
          style={{ background: CREAM, color: INK, boxShadow: '3px 4px 0 rgba(30,58,48,0.15)' }}
        >
          <span>⛳</span> ゴルトモ
        </div>

        {/* 大見出し：ゴルフMBTI */}
        <h1
          className="text-center font-black leading-tight tracking-tight"
          style={{ color: INK, fontSize: '46px' }}
        >
          ゴルフMBTI
        </h1>
        <p className="text-center mt-2.5 text-[14px] font-bold leading-relaxed" style={{ color: '#5A7A6D' }}>
          ゴルフ版の性格診断で、あなたに合うゴルフ仲間を見つけよう。<br />気になるコンテンツを選んでね👇
        </p>

        {/* 2つのコンテンツ（表示・クリックを /api/lp/hit に計測） */}
        <HubLinks />

        <div className="mt-10 text-[11px] font-bold" style={{ color: '#8AA79A' }}>
          © ゴルトモ
        </div>
      </div>
    </main>
  );
}
