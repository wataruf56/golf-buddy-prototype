'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { SwingDoc } from '@/types/swing';

// Lightweight monthly calendar showing which days the user did a swing analysis.
// Click a date with activity → jump to that swing's result page.
// Tap "<" or ">" to navigate months.

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PracticeCalendar() {
  const [swings, setSwings] = useState<SwingDoc[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/swing/list', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          setSwings(d.swings || []);
        }
      } catch { /* swallow */ }
      setLoaded(true);
    })();
  }, []);

  // Group by yyyy-mm-dd
  const byDay = useMemo(() => {
    const m = new Map<string, SwingDoc[]>();
    for (const s of swings) {
      const key = ymd(new Date(s.createdAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [swings]);

  // If user has no swings ever, hide the calendar (don't waste vertical space).
  if (loaded && swings.length === 0) return null;

  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = ymd(new Date());

  const cells: ({ date: string; day: number; entries: SwingDoc[] } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(new Date(year, month, d));
    cells.push({ date, day: d, entries: byDay.get(date) || [] });
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-bold">📅 スイング練習カレンダー</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-7 h-7 flex items-center justify-center text-sub"
          >‹</button>
          <span className="text-xs font-bold tabular-nums w-20 text-center">
            {year}年{month + 1}月
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-7 h-7 flex items-center justify-center text-sub"
          >›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_JA.map((w, i) => (
          <div key={w} className={`text-[10px] text-center font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue' : 'text-muted'}`}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" />;
          const isToday = c.date === today;
          const has = c.entries.length > 0;
          const inner = (
            <div
              className={`aspect-square rounded-lg flex flex-col items-center justify-center relative
                ${has ? 'bg-green-light' : 'bg-bg'}
                ${isToday ? 'ring-2 ring-green' : ''}`}
            >
              <span className={`text-[11px] ${has ? 'font-black text-green' : 'text-text'}`}>{c.day}</span>
              {has && (
                <span className="text-[9px] mt-0.5 text-green">{c.entries.length}本</span>
              )}
            </div>
          );
          if (has) {
            // Link to the most recent (last) entry of that day.
            const latest = c.entries.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
            return <Link key={i} href={`/swing/${latest.swingId}`}>{inner}</Link>;
          }
          return <div key={i}>{inner}</div>;
        })}
      </div>

      <div className="flex justify-center mt-3 text-[10px] text-muted gap-3">
        <span>計 <b className="text-green">{swings.length}</b> 本</span>
      </div>
    </div>
  );
}
