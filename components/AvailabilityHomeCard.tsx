'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AvailLegend, AvailPersonChip } from '@/components/AvailPersonChip';
import { AvailabilityIntro } from '@/components/AvailabilityIntro';
import { AVAIL_ROOM_MIN, dateLabel, type AvailPerson } from '@/lib/availabilityShared';

// ホーム上部の「行ける日が出ている人」。
//   ・20〜30代の会員にだけ出る（API が enabled:false を返したら何も出さない）
//   ・日付ごとに、その日に行ける人の札を並べる（名前が出るかは API 側で決まる）
//   ・入口は「カレンダーを開く」ひとつ。最寄り駅が未登録の人には、その旨だけ添える
type Resp = {
  enabled: boolean; needsStation?: boolean;
  /** 使い方ポップアップを見終わったか。false なら1回出す（20〜30代の全員に） */
  introSeen?: boolean;
  byDate: Record<string, AvailPerson[]>; mine: string[];
  /** 自分が入っている日付ごとのチャット部屋 */
  rooms?: Record<string, { id: string; count: number }>;
};
const SHOW_DAYS = 5;

export function AvailabilityHomeCard() {
  const [data, setData] = useState<Resp | null>(null);
  useEffect(() => {
    let dead = false;
    fetch('/api/availability', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!dead && d) setData(d); })
      .catch(() => { /* 出せなくてもホームは動く */ });
    return () => { dead = true; };
  }, []);
  if (!data || !data.enabled) return null;

  const dates = Object.keys(data.byDate).filter((d) => (data.byDate[d] || []).length > 0).sort();
  const shown = dates.slice(0, SHOW_DAYS);
  const people = new Set<string>();
  dates.forEach((d) => data.byDate[d].forEach((p, i) => people.add(p.id || `${d}:${i}`)));

  return (
    <div className="px-5 pb-3">
      {data.introSeen === false && (
        <AvailabilityIntro needsStation={!!data.needsStation} onDone={() => setData((cur) => (cur ? { ...cur, introSeen: true } : cur))} />
      )}
      <div className="bg-card rounded-card shadow-card border-2 border-border p-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-black">📅 行ける日が出ている人</span>
          {dates.length > 0 && (
            <span className="text-[11px] font-black text-white bg-green px-2 py-0.5 rounded-full leading-none">{dates.length}日</span>
          )}
        </div>
        <div className="mt-2"><AvailLegend /></div>
        <div className="text-[11px] text-sub font-bold mt-1.5 leading-relaxed">
          同じ日に{AVAIL_ROOM_MIN}人集まると、その日のチャットが始まります。
          {data.needsStation && <><br />※ 行ける日を出すには、プロフィールの最寄り駅が必要です。</>}
        </div>

        {Object.keys(data.rooms || {}).length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {Object.keys(data.rooms!).sort().map((iso) => {
              const l = dateLabel(iso); const room = data.rooms![iso];
              return (
                <Link key={iso} href={`/round/${room.id}/chat`} className="flex items-center gap-2 bg-green-light border-2 border-green rounded-xl px-3 py-2">
                  <span className="text-base">💬</span>
                  <span className="text-[13px] font-black text-green flex-1">{l.md}（{l.w}）のチャット</span>
                  <span className="text-[11px] font-bold text-sub">{room.count}人</span>
                  <span className="text-green">›</span>
                </Link>
              );
            })}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="mt-3 text-[12px] font-bold text-sub bg-bg rounded-xl px-3 py-2.5">
            まだ「行ける日」を出している人はいません。最初の1人になれます。
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {shown.map((iso, i) => {
              const l = dateLabel(iso);
              const dateCls = l.dow === 6 ? 'text-blue' : l.dow === 0 ? 'text-orange' : 'text-text';
              return (
                <li key={iso} className={`grid grid-cols-[52px_1fr] gap-2 items-start ${i > 0 ? 'pt-2.5 border-t border-dashed border-hair' : ''}`}>
                  <div className={`font-black leading-tight ${dateCls}`}>
                    <div className="text-[14px] font-mono">{l.md}</div>
                    <div className="text-[10px] text-sub">{l.w}曜</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.byDate[iso].map((p, j) => <AvailPersonChip key={p.id || j} p={p} />)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {dates.length > SHOW_DAYS && (
          <div className="text-[11px] text-sub font-bold mt-2">ほか {dates.length - SHOW_DAYS}日はカレンダーで</div>
        )}

        <Link href="/availability" className="block w-full mt-3 py-3 rounded-xl border-2 border-border bg-green text-white text-center text-[15px] font-black">
          {data.mine.length > 0 ? `カレンダーを開く（あなたの行ける日：${data.mine.length}日）` : 'カレンダーを開く'}
        </Link>
      </div>
    </div>
  );
}
