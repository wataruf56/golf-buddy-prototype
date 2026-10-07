'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { track } from '@/lib/telemetry';

// タイムライン（2026-10-08）：みんなの動きを LINE のシステムメッセージ風の灰色1行で。lib/timeline 参照。
type Item = { id: string; kind: 'signup' | 'avail' | 'round'; at: number; name: string; text: string; sub?: string; link?: string };

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(now.getTime())) return '今日';
  if (dayKey(ts) === dayKey(y.getTime())) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
}
function hm(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TimelinePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch('/api/timeline', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json()).then((j) => setItems(j.items || [])).catch(() => setItems([]));
  }, []);

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-2">
        <div className="text-[20px] font-black">📰 タイムライン</div>
        <div className="text-[11px] text-sub">みんなの動き（同じ年代のメンバーだけ・30日分）</div>
      </div>
      {items === null && <div className="text-center text-[12px] text-muted py-10">読み込み中...</div>}
      {items && items.length === 0 && <div className="text-center text-[12px] text-muted py-10">まだ動きはありません</div>}
      <div className="px-4">
        {(items || []).map((it, i) => {
          const showDay = i === 0 || dayKey(items![i - 1].at) !== dayKey(it.at);
          const body = (
            <>
              <b className="font-black text-text">{it.name}</b>{it.text}
              {it.sub && <span className="block text-[10.5px] text-sub mt-0.5 truncate">{it.sub}</span>}
            </>
          );
          return (
            <div key={it.id}>
              {showDay && (
                <div className="text-center my-3">
                  <span className="inline-block rounded-full px-3 py-[3px] text-[10.5px] font-bold text-white" style={{ background: 'rgba(0,0,0,.2)' }}>{dayLabel(it.at)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                {it.link ? (
                  <Link href={it.link} onClick={() => track('timeline_tap', { kind: it.kind })}
                    className="flex-1 min-w-0 bg-card border-[1.5px] border-border rounded-2xl px-3 py-2 text-[12px] leading-snug text-sub flex items-center gap-2">
                    <span className="flex-1 min-w-0">{body}</span><span className="text-orange font-black">›</span>
                  </Link>
                ) : (
                  <div className="flex-1 min-w-0 rounded-2xl px-3 py-2 text-[12px] leading-snug text-sub" style={{ background: '#DCE6DF' }}>{body}</div>
                )}
                <div className="text-[10px] text-muted w-9 text-right flex-shrink-0">{hm(it.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
