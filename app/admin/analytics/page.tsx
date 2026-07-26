'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：アクセス分析。①登録者数の推移 ②時間帯別アクセス（全体）
// ③カレンダー（日付タップでその日の時間帯別＋日次トータル）。データは /api/admin/analytics。

type HourCell = { hour: number; users: number; events: number };
type Analytics = {
  registrations: { byDay: { date: string; count: number; cumulative: number }[]; total: number; withDate: number };
  access: {
    windowDays: number; sampled: boolean; uniqueUsers: number;
    byDay: { date: string; users: number; events: number }[];
    byHourOverall: HourCell[];
    byDayHour: Record<string, HourCell[]>;
  };
  generatedAt: number;
};

export default function AdminAnalyticsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true); setErr('');
      try {
        const r = await fetch(`/api/admin/analytics?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `${r.status}`);
        setData(j);
      } catch (e) { setErr((e as Error).message); }
      setLoading(false);
    })();
  }, [token]);

  const accessByDay = useMemo(() => {
    const m = new Map<string, { users: number; events: number }>();
    (data?.access.byDay || []).forEach((d) => m.set(d.date, { users: d.users, events: d.events }));
    return m;
  }, [data]);
  const maxDayUsers = useMemo(() => Math.max(1, ...(data?.access.byDay || []).map((d) => d.users)), [data]);
  const maxHourUsers = useMemo(() => Math.max(1, ...(data?.access.byHourOverall || []).map((h) => h.users)), [data]);
  const maxReg = useMemo(() => Math.max(1, ...(data?.registrations.byDay || []).map((d) => d.count)), [data]);

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const monthLead = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const selHours = selectedDay ? (data?.access.byDayHour[selectedDay] || []) : [];
  const selTotalUsers = selectedDay ? (accessByDay.get(selectedDay)?.users || 0) : 0;
  const selTotalEvents = selectedDay ? (accessByDay.get(selectedDay)?.events || 0) : 0;
  const maxSelHour = Math.max(1, ...selHours.map((h) => h.events));

  const reg = data?.registrations;
  const recentReg = (reg?.byDay || []).slice(-30);

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">📈 アクセス分析</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        登録者数の推移と、アプリ内アクセスの日別・時間帯別（直近{data?.access.windowDays || 60}日）。カレンダーの日付を押すと、その日の時間帯別が見られます。
      </div>

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="text-sm text-red-600 font-bold mb-3">読み込み失敗: {err}</div>}

      {data && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Kpi label="総登録者数" value={`${reg?.total ?? 0}`} accent="text-green" />
            <Kpi label={`直近${data.access.windowDays}日 アクセス実人数`} value={`${data.access.uniqueUsers}`} />
          </div>

          {/* ① 登録者数の推移 */}
          <Section title="👥 登録者数の推移（日別・累計）">
            {recentReg.length === 0 ? (
              <Empty>登録データがありません（createdAt未記録の可能性）</Empty>
            ) : (
              <div className="flex flex-col gap-1">
                {recentReg.map((d) => (
                  <div key={d.date} className="flex items-center gap-2 text-[12px]">
                    <span className="w-16 shrink-0 text-muted tabular-nums">{d.date.slice(5)}</span>
                    <div className="flex-1 h-4 bg-bg rounded overflow-hidden">
                      <div className="h-full bg-green rounded" style={{ width: `${Math.round((d.count / maxReg) * 100)}%` }} />
                    </div>
                    <span className="w-8 text-right font-bold tabular-nums">+{d.count}</span>
                    <span className="w-12 text-right text-muted tabular-nums">計{d.cumulative}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ② 時間帯別アクセス（全体） */}
          <Section title={`🕒 時間帯別アクセス（全体・直近${data.access.windowDays}日）`}>
            <div className="text-[10px] text-muted mb-1.5">棒＝その時間帯に来た実人数（重複なし）。</div>
            <div className="flex items-end gap-[3px] h-28">
              {data.access.byHourOverall.map((h) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.hour}時：${h.users}人 / ${h.events}件`}>
                  <div className="w-full bg-blue rounded-t" style={{ height: `${Math.round((h.users / maxHourUsers) * 100)}%`, minHeight: h.users > 0 ? 2 : 0 }} />
                  <span className="text-[8px] text-muted mt-0.5">{h.hour}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ③ カレンダー */}
          <Section title="📅 カレンダー（日付タップで時間帯別）">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="w-8 h-8 rounded-full bg-bg border border-border text-sm font-black">‹</button>
              <div className="text-[14px] font-black">{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</div>
              <button onClick={() => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="w-8 h-8 rounded-full bg-bg border border-border text-sm font-black">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DOW.map((w, i) => <div key={w} className={`text-center text-[10px] font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue' : 'text-muted'}`}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: monthLead }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dnum = i + 1;
                const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dnum);
                const key = iso(dt);
                const users = accessByDay.get(key)?.users || 0;
                const intensity = users > 0 ? Math.min(1, 0.15 + (users / maxDayUsers) * 0.85) : 0;
                const isSel = key === selectedDay;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(isSel ? '' : key)}
                    className={`aspect-square rounded-lg border text-[11px] font-bold flex flex-col items-center justify-center ${isSel ? 'border-green border-2' : 'border-border'}`}
                    style={{ background: users > 0 ? `rgba(58,160,201,${intensity})` : '#fff', color: intensity > 0.55 ? '#fff' : '#33271B' }}
                    title={`${key}：${users}人`}
                  >
                    <span>{dnum}</span>
                    {users > 0 && <span className="text-[8px] opacity-80">{users}</span>}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-muted mt-1.5">色が濃いほどアクセス実人数が多い日。数字＝その日の実人数。</div>

            {/* 選択日の時間帯別 */}
            {selectedDay && (
              <div className="mt-3 bg-bg rounded-xl p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[13px] font-black">{selectedDay} の時間帯別</div>
                  <div className="text-[11px] text-muted">実人数 <b className="text-text">{selTotalUsers}</b> / 延べ {selTotalEvents}件</div>
                </div>
                <div className="flex items-end gap-[3px] h-24">
                  {selHours.map((h) => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.hour}時：${h.users}人 / ${h.events}件`}>
                      <div className="w-full bg-orange rounded-t" style={{ height: `${Math.round((h.events / maxSelHour) * 100)}%`, minHeight: h.events > 0 ? 2 : 0 }} />
                      <span className="text-[8px] text-muted mt-0.5">{h.hour}</span>
                    </div>
                  ))}
                </div>
                {selTotalEvents === 0 && <div className="text-[11px] text-muted text-center py-2">この日のアクセス記録はありません</div>}
              </div>
            )}
          </Section>

          {data.access.sampled && (
            <div className="text-[10px] text-orange font-bold mt-2">※ アクセス件数が上限に達したため、一部の古いログは集計に含まれていない可能性があります。</div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-3">
      <div className={`text-[22px] font-black leading-none ${accent || 'text-text'}`}>{value}</div>
      <div className="text-[10px] text-muted mt-1 leading-tight">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-4 mb-4">
      <div className="text-[13px] font-black mb-2">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-muted text-center py-4">{children}</div>;
}
