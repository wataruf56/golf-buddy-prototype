'use client';

import { getGolmotiType, golmotiUrl, golmotiImg } from '@/lib/golmoti';

// プロフィールに表示するゴルフ診断（GOLMOTI）タイプのバッジ。
// 動物キャラ画像＋タイプ名を組み合わせて表示。code が未設定/不正なら何も描画しない。
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
    'inline-flex items-center gap-2 pl-1.5 pr-3 py-1 bg-green-light text-green text-[12px] font-bold rounded-full border-2 border-green ' +
    className;
  const inner = (
    <>
      <img
        src={golmotiImg(t.code)}
        alt={t.animal}
        className="w-7 h-7 object-contain rounded-full bg-white/70"
      />
      <span className="leading-tight">{t.name}</span>
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
