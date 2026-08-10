import type { Metadata } from 'next';
import { HubLinks } from '@/components/HubLinks';

// Instagram の link-in-bio 用ページ（LINE友だち追加専用）。
// インスタのプロフィールには line.me のURLを直接貼れない（ドメインブロック）ため、
// このページを経由して公式LINEの友だち追加へ誘導する。診断（MBTI）等は
// インスタ側で別リンクとして直接貼る方針（2026-08-10〜）。
// app.goltomo.com/links で公開（未ログインで閲覧可・アプリ枠なし）。
export const metadata: Metadata = {
  title: 'ゴルトモ 公式LINE | 友だち追加',
  description: 'ゴルトモの公式LINEを友だち追加。募集中のゴルフラウンド一覧が届き、登録も参加もLINEで完結。',
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

        {/* 大見出し：公式LINE */}
        <h1
          className="text-center font-black leading-tight tracking-tight"
          style={{ color: INK, fontSize: '42px' }}
        >
          ゴルトモ公式LINE
        </h1>
        <p className="text-center mt-2.5 text-[14px] font-bold leading-relaxed" style={{ color: '#5A7A6D' }}>
          友だち追加すると、いま募集中のラウンド一覧が届きます。<br />登録も参加もLINEで完結👇
        </p>

        {/* LINE友だち追加（表示・クリックを /api/lp/hit に計測） */}
        <HubLinks />

        <div className="mt-10 text-[11px] font-bold" style={{ color: '#8AA79A' }}>
          © ゴルトモ
        </div>
      </div>
    </main>
  );
}
