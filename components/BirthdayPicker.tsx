'use client';

import { useEffect, useState } from 'react';
import { ageFromBirthday, parseBirthday } from '@/lib/ageGate';

// 誕生日の入力（2026-10-20）。年・月・日の3つの選択。値は 'YYYY-MM-DD'（そろうまでは ''）。
// 年は新しい順（入れる人が多い1980〜2000年代が上のほうに来るように）。選ぶと「◯歳」を横に出す。
// 年齢は誕生日から数える（lib/ageGate.ageFromBirthday）＝本人は一度登録すると変えられない。
export function BirthdayPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const p = parseBirthday(value);
  const [y, setY] = useState(p ? String(p.y) : '');
  const [m, setM] = useState(p ? String(p.m) : '');
  const [d, setD] = useState(p ? String(p.d) : '');
  useEffect(() => {
    const q = parseBirthday(value);
    if (q) { setY(String(q.y)); setM(String(q.m)); setD(String(q.d)); }
  }, [value]);

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let yy = thisYear - 10; yy >= thisYear - 99; yy--) years.push(yy);
  const days = y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;

  const emit = (ny: string, nm: string, nd: string) => {
    setY(ny); setM(nm); setD(nd);
    if (ny && nm && nd && Number(nd) <= new Date(Number(ny), Number(nm), 0).getDate()) {
      onChange(`${ny}-${nm.padStart(2, '0')}-${nd.padStart(2, '0')}`);
    } else onChange('');
  };
  const age = p ? ageFromBirthday(value) : 0;
  const cls = 'flex-1 min-w-0 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none disabled:opacity-60';
  return (
    <div className="flex items-center gap-1.5">
      <select aria-label="生まれた年" className={cls} value={y} disabled={disabled} onChange={(e) => emit(e.target.value, m, d)}>
        <option value="">年</option>
        {years.map((yy) => <option key={yy} value={yy}>{yy}年</option>)}
      </select>
      <select aria-label="生まれた月" className={cls} value={m} disabled={disabled} onChange={(e) => emit(y, e.target.value, d)}>
        <option value="">月</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => <option key={mm} value={mm}>{mm}月</option>)}
      </select>
      <select aria-label="生まれた日" className={cls} value={d} disabled={disabled} onChange={(e) => emit(y, m, e.target.value)}>
        <option value="">日</option>
        {Array.from({ length: days }, (_, i) => i + 1).map((dd) => <option key={dd} value={dd}>{dd}日</option>)}
      </select>
      <span className="shrink-0 w-12 text-right text-[13px] font-black text-text">{age > 0 ? `${age}歳` : ''}</span>
    </div>
  );
}
