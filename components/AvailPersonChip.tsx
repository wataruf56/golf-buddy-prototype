'use client';

import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import type { AvailPerson } from '@/lib/availabilityShared';

// 「行ける日」の1人ぶんの札。
//   ・青＝男性、ピンク＝女性（年齢の色と、名前が無いときのアイコンの色）
//   ・枠で囲われて影がある札＝車を出せる人
//   ・名前がある（女性が見ている／自分）→ 写真と名前が出て、札ごとタップでプロフィールへ
//   ・名前が無い（男性が見ている）→ 「？」と年齢だけ。押せない
export function AvailPersonChip({ p }: { p: AvailPerson }) {
  const female = p.gender === 'female';
  const ageCls = female ? 'text-sakura' : 'text-blue';
  const carTitle = p.car
    ? `車を出せる${p.seats ? `（${p.seats}人乗り${p.bags ? `・バッグ${p.bags}個` : ''}）` : ''}`
    : '';
  const cls = [
    'inline-flex items-center gap-1.5 pl-[3px] pr-2.5 py-[3px] rounded-full bg-white border-2 text-[11px] font-black text-text leading-none',
    p.car ? 'border-border shadow-[2px_2px_0_#1E3A30]' : 'border-transparent',
    p.me ? 'ring-[3px] ring-green-light' : '',
  ].join(' ');
  const inner = p.name ? (
    <>
      <Avatar user={{ avatar: p.avatar, avatarUrl: p.avatarUrl, color: p.color, avatarMode: p.avatarMode, golmotiType: p.golmotiType } as any} size={26} emojiSize={14} />
      <span className="max-w-[6em] truncate">{p.me ? 'あなた' : p.name}</span>
      <span className={`font-mono ${ageCls}`}>{p.age}</span>
      {p.car && <span className="text-[10px]" aria-label={carTitle}>🚗</span>}
    </>
  ) : (
    <>
      <span className={`w-[26px] h-[26px] rounded-full grid place-items-center text-[12px] ${female ? 'bg-sakura-light text-sakura' : 'bg-blue-light text-blue'}`} aria-hidden>？</span>
      <span className={`font-mono ${ageCls}`}>{p.age}</span>
      {p.car && <span className="text-[10px]" aria-label={carTitle}>🚗</span>}
    </>
  );
  if (p.id && !p.me) {
    return <Link href={`/profile/${p.id}`} className={cls} title={carTitle}>{inner}</Link>;
  }
  return <span className={cls} title={carTitle}>{inner}</span>;
}

/** 札の見方（青・ピンク・枠つき）。ホームとカレンダーで同じものを出す。 */
export function AvailLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-sub font-bold">
      <span><i className="inline-block w-3.5 h-3.5 rounded-full bg-blue align-[-3px] mr-1" />男性</span>
      <span><i className="inline-block w-3.5 h-3.5 rounded-full bg-sakura align-[-3px] mr-1" />女性</span>
      <span><i className="inline-block w-3.5 h-3.5 rounded-full bg-white border-2 border-border shadow-[1.5px_1.5px_0_#1E3A30] align-[-3px] mr-1" />枠つき🚗＝車を出せる人</span>
    </div>
  );
}
