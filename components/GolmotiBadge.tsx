'use client';

import { getGolmotiType, golmotiUrl } from '@/lib/golmoti';

// プロフィールに表示するゴルフ診断（GOLMOTI）タイプのバッジ。
// code が未設定 or 不正なら何も描画しない。link=true で診断結果ページへのリンクにする。
export function GolmotiBadge({
  code,
  link = false,
  showCode = true,
  className = '',
}: {
  code?: string;
  link?: boolean;
  showCode?: boolean;
  className?: string;
}) {
  const t = getGolmotiType(code);
  if (!t) return null;

  const base =
    'inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-light text-green text-[11px] font-bold rounded-full border-2 border-green ' +
    className;
  const inner = (
    <>
      <span className="text-[13px] leading-none">{t.emoji}</span>
      <span>{t.name}</span>
      {showCode && <span className="opacity-70 font-num">{t.code}</span>}
    </>
  );

  if (link) {
    return (
      <a href={golmotiUrl(t.code)} className={base}>
        {inner}
      </a>
    );
  }
  return <span className={base}>{inner}</span>;
}
