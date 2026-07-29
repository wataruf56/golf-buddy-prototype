'use client';

import Link from 'next/link';
import type { User } from '@/lib/types';
import { drinkLabel, smokeLabel } from '@/lib/lifestyle';

// マイページ／他人のプロフィールで共通の「詳細プロフィール欄」（マッチングアプリ風）。
//   editHref   : 指定すると「編集 ›」を出す（自分のマイページ用）。
//   myHobbies  : 閲覧者自身の趣味。渡すと共通の趣味をハイライト＋サマリー表示（他人のプロフィール用）。
export function ProfileDetails({ user, editHref, myHobbies }: {
  user: Partial<User>;
  editHref?: string;
  myHobbies?: string[];
}) {
  const hobbies: string[] = Array.isArray(user.hobbies) ? user.hobbies : [];
  const mine = new Set<string>(Array.isArray(myHobbies) ? myHobbies : []);
  const common = hobbies.filter((h) => mine.has(h));

  const rows: Array<{ label: string; value?: string }> = [
    { label: '🗓️ いける曜日', value: user.availableDays },
    { label: '🎯 スコア帯', value: user.scoreRange },
    { label: '📍 エリア', value: user.area },
    { label: '⛳ ゴルフ歴', value: user.golfHistory },
    { label: '📅 頻度', value: user.frequency },
    { label: '🚗 車', value: user.car ? (user.car === 'have' ? 'あり' : 'なし') : '' },
    { label: '🍶 お酒', value: drinkLabel(user.drinkStatus) },
    { label: '🚬 タバコ', value: smokeLabel(user.smokeStatus) },
    { label: '💼 仕事', value: user.job },
  ];
  const shown = rows.filter((r) => r.value);
  const hasAny = shown.length > 0 || hobbies.length > 0;
  if (!hasAny && !editHref) return null;

  return (
    <div className="mt-3 bg-bg rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-black text-sub">プロフィール</span>
        {editHref && <Link href={editHref} className="text-[11px] font-bold text-blue">編集 ›</Link>}
      </div>

      {shown.length > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {shown.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2 gap-3">
              <span className="text-[12px] text-muted font-bold flex-shrink-0">{r.label}</span>
              <span className="text-[13px] font-bold text-text text-right truncate">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* 趣味タグ（共通ハイライト） */}
      <div className={(shown.length > 0 ? 'mt-2.5 pt-2.5 border-t border-border' : '')}>
        <div className="text-[12px] font-black text-sub mb-1.5">🎯 趣味</div>
        {common.length > 0 && (
          <div className="mb-2 text-[12px] font-bold text-green bg-green-light border border-green rounded-lg px-3 py-2">
            共通の趣味 {common.length}個：{common.join('・')}
          </div>
        )}
        {hobbies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {hobbies.map((h) => {
              const isCommon = mine.has(h);
              return (
                <span key={h} className={'px-3 py-1.5 text-[12px] font-bold rounded-full border-[1.5px] ' + (isCommon ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}>
                  {isCommon ? '✓ ' : ''}{h}
                </span>
              );
            })}
          </div>
        ) : editHref ? (
          <Link href={editHref} className="text-[12px] text-blue font-bold">＋ 趣味を追加する</Link>
        ) : (
          <div className="text-[12px] text-muted">未設定</div>
        )}
      </div>
    </div>
  );
}
