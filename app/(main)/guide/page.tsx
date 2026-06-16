'use client';

import Link from 'next/link';

// 使い方ガイド：LP風の1枚もの。やることは「①プロフィール登録 → ②参加」の
// 2ステップだけ、というシンプルな流れが一目で分かる構成。
export default function GuidePage() {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-bg">
      <div className="px-5 pt-6 pb-24 max-w-md mx-auto">
        {/* ヒーロー */}
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">⛳</div>
          <h1 className="text-[22px] font-black leading-tight">ゴルトモの使い方</h1>
          <p className="text-[13px] text-sub mt-1.5">同世代のゴルフ仲間と回るまで、<br />たったの<b className="text-green">2ステップ</b>。</p>
        </div>

        {/* STEP 1 */}
        <StepCard
          n={1}
          emoji="📝"
          title="プロフィールを登録する"
          desc="名前・年齢・スコアなどを入力。これだけで準備OK。あなたに合う仲間とつながりやすくなります。"
          cta={{ href: '/mypage/edit', label: 'プロフィールを登録する' }}
        />

        <Connector />

        {/* STEP 2 */}
        <StepCard
          n={2}
          emoji="⛳"
          title="参加したいラウンドに参加する"
          desc="気になるラウンド募集を見つけたら、専用の「参加する」ボタンを押すだけ。あとは当日を待つだけです。"
          cta={{ href: '/search', label: 'ラウンドを探す' }}
        />

        {/* 締め */}
        <div className="mt-8 text-center bg-green-light rounded-card p-5 border-[1.5px] border-green">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-[14px] font-black text-green">これだけ！</div>
          <p className="text-[12px] text-sub mt-1">あとは一緒に回って、楽しいゴルフを。</p>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  n, emoji, title, desc, cta,
}: {
  n: number; emoji: string; title: string; desc: string; cta: { href: string; label: string };
}) {
  return (
    <div className="bg-card rounded-card shadow-card p-5">
      <div className="flex items-center gap-3 mb-2.5">
        <span className="flex-shrink-0 w-10 h-10 rounded-full bg-green text-white text-[18px] font-black flex items-center justify-center">{n}</span>
        <div className="text-[17px] font-black leading-tight">{emoji} {title}</div>
      </div>
      <p className="text-[13px] text-sub leading-relaxed mb-4">{desc}</p>
      <Link href={cta.href} className="block w-full text-center py-3 bg-green text-white rounded-xl text-[14px] font-bold">
        {cta.label}
      </Link>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-2">
      <span className="text-2xl text-green">↓</span>
    </div>
  );
}
