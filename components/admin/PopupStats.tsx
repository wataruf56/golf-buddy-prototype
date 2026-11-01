'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';

// ポップアップの反応（統計）。2026-10-12 に計測ハブで作ったものを、2026-11-01 に管理画面「🪟 ポップアップ」へ移した。
// ポップアップごとに：出した人数・成果率・何もしなかった人・操作までの時間・日別、開くと押したものの内訳 →「誰が・いつ」。
// もとデータは /api/admin/popups（_popupEvents）。
export type PopupRow = {
  id: string; name: string; emoji: string; who: string; forced: boolean;
  actionLabels: Record<string, string>; goal: string[];
  shows: number; shownUsers: number; goalUsers: number; goalRate: number | null;
  noAction: number; noActionRate: number | null; medianSec: number | null;
  actions: Record<string, { count: number; users: number }>;
  daily: Array<{ day: string; shows: number; goals: number }>; lastAt: number;
  shows24h: number; lastShowAt: number; lock: string; settings: { href: string; label: string } | null;
};

export const fmtSec = (s: number | null) => (s == null ? '—' : s < 60 ? `${s}秒` : s < 3600 ? `${Math.round(s / 60)}分` : `${Math.round(s / 3600)}時間`);
export const fmtAt = (ms: number) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

export function PopupStats({ token, days, withTest, popups, openId, onOpen, onSearch }: {
  token: string; days: number; withTest: boolean; popups: PopupRow[];
  openId: string | null; onOpen: (id: string | null) => void;
  onSearch?: (popup: string, action?: string) => void;
}) {
  const [drill, setDrill] = useState<{ popup: string; who: string } | null>(null);
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const sorted = popups.slice().sort((a, b) => b.shownUsers - a.shownUsers || a.name.localeCompare(b.name));
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((p) => {
        const max = Math.max(1, ...p.daily.map((d) => d.shows));
        const isOpen = openId === p.id;
        const acts = Object.entries(p.actions).sort((a, b) => b[1].users - a[1].users);
        return (
          <div key={p.id} id={`stat-${p.id}`} className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden">
            <button type="button" onClick={() => onOpen(isOpen ? null : p.id)} className="w-full text-left p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[18px]">{p.emoji}</span>
                <span className="text-[14px] font-black">{p.name}</span>
                {p.forced && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-300">閉じられない</span>}
                <span className="ml-auto text-[10.5px] text-muted">最後 {fmtAt(p.lastAt)}</span>
              </div>
              <div className="text-[11px] text-sub mt-0.5">{p.who}</div>
              <div className="grid grid-cols-4 gap-2 mt-2.5">
                <Mini label="出した人" value={`${p.shownUsers}人`} sub={`${p.shows}回`} />
                <Mini label="成果率" value={pct(p.goalRate)} sub={`${p.goalUsers}人（${p.goal.map((g) => p.actionLabels[g] || g).join('・') || '—'}）`} good />
                <Mini label="何もしなかった" value={pct(p.noActionRate)} sub={`${p.noAction}人`} warn={(p.noActionRate || 0) >= 50} />
                <Mini label="操作までの時間" value={fmtSec(p.medianSec)} sub="中央値" />
              </div>
              {/* 日別（棒＝表示・緑＝成果） */}
              <div className="flex items-end gap-[2px] h-10 mt-2.5" aria-label="日別の表示回数">
                {p.daily.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col justify-end h-full" title={`${d.day} 表示${d.shows}・成果${d.goals}`}>
                    <div className="bg-border/30 rounded-t-sm relative" style={{ height: `${(d.shows / max) * 100}%` }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-green rounded-t-sm" style={{ height: d.shows ? `${Math.min(100, (d.goals / d.shows) * 100)}%` : 0 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9.5px] text-muted mt-0.5"><span>{p.daily[0]?.day.slice(5)}</span><span>{isOpen ? '▲ 閉じる' : '▼ 押したものの内訳'}</span><span>{p.daily[p.daily.length - 1]?.day.slice(5)}</span></div>
            </button>
            {isOpen && (
              <div className="border-t-2 border-hair px-3.5 py-3">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <DrillBtn on={drill?.popup === p.id && drill?.who === 'show'} onClick={() => setDrill(drill?.popup === p.id && drill?.who === 'show' ? null : { popup: p.id, who: 'show' })}>👀 出した人 {p.shownUsers}人</DrillBtn>
                  <DrillBtn on={drill?.popup === p.id && drill?.who === '__noaction'} onClick={() => setDrill(drill?.popup === p.id && drill?.who === '__noaction' ? null : { popup: p.id, who: '__noaction' })}>😶 何もしなかった人 {p.noAction}人</DrillBtn>
                  {onSearch && <button type="button" onClick={() => onSearch(p.id)} className="px-2.5 py-1 rounded-full text-[11px] font-black border-[1.5px] border-border bg-card">🔎 このポップアップの記録をさがす</button>}
                </div>
                {drill?.popup === p.id && (drill.who === 'show' || drill.who === '__noaction') && <WhoList token={token} days={days} withTest={withTest} popup={p.id} who={drill.who} />}
                {acts.length === 0 ? <div className="text-[12px] text-muted">まだ操作の記録がありません</div> : (
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-sub text-left"><th className="py-1 font-bold">押したもの</th><th className="py-1 font-bold text-right">人数</th><th className="py-1 font-bold text-right">出した人のうち</th><th className="py-1 font-bold text-right">回数</th></tr></thead>
                    <tbody>
                      {acts.map(([a, v]) => {
                        const on = drill?.popup === p.id && drill?.who === a;
                        return (
                          <Fragment key={a}>
                            <tr onClick={() => setDrill(on ? null : { popup: p.id, who: a })}
                              className={'border-t border-hair cursor-pointer hover:bg-green-light/50 ' + (on ? 'bg-green-light/60' : '')}>
                              <td className="py-1.5">{on ? '▾ ' : '▸ '}{p.goal.includes(a) && '🎯 '}{p.actionLabels[a] || a}<span className="text-[10px] text-muted ml-1">{a}</span></td>
                              <td className="py-1.5 text-right font-black">{v.users}人</td>
                              <td className="py-1.5 text-right">{p.shownUsers ? `${Math.round((v.users / p.shownUsers) * 100)}%` : '—'}</td>
                              <td className="py-1.5 text-right text-sub">{v.count}回</td>
                            </tr>
                            {on && (
                              <tr><td colSpan={4} className="pb-2"><WhoList token={token} days={days} withTest={withTest} popup={p.id} who={a} /></td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {p.id === 'promo' && <Link href={`/admin/promo${qs}`} className="inline-block mt-2 text-[12px] text-blue font-bold">→ イチオシごとの効果を見る</Link>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// もう1段：誰が・いつ（何時何分）・どの画面で
function WhoList({ token, days, withTest, popup, who }: { token: string; days: number; withTest: boolean; popup: string; who: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [label, setLabel] = useState('');
  useEffect(() => {
    setRows(null);
    fetch(`/api/admin/popups?token=${encodeURIComponent(token)}&days=${days}${withTest ? '&test=1' : ''}&popup=${encodeURIComponent(popup)}&who=${encodeURIComponent(who)}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { setRows(j.rows || []); setLabel(j.label || who); }).catch(() => setRows([]));
  }, [token, days, withTest, popup, who]);
  const at = (ms: number) => new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (!rows) return <div className="text-[11px] text-muted py-2">読み込み中…</div>;
  return (
    <div className="mt-1 rounded-xl border-2 border-green bg-green-light/30 p-2.5">
      <div className="text-[11.5px] font-black mb-1.5">「{label}」 {rows.length}件{rows.length >= 500 ? '（新しい順に500件まで）' : '（新しい順）'}</div>
      {rows.length === 0 ? <div className="text-[11px] text-muted">記録がありません</div> : (
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-[11.5px]">
            <thead><tr className="text-sub text-left"><th className="py-0.5 font-bold">日時</th><th className="py-0.5 font-bold">誰が</th><th className="py-0.5 font-bold">どの画面で</th><th className="py-0.5 font-bold">補足</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.userId}-${r.ts}-${i}`} className="border-t border-hair align-top">
                  <td className="py-1 whitespace-nowrap font-num">{at(r.ts)}</td>
                  <td className="py-1">
                    <a href={`https://app.goltomo.com/profile/${r.userId}`} target="_blank" rel="noreferrer" className="font-bold text-blue">{r.user?.name || r.userId}</a>
                    <span className="text-[10px] text-muted ml-1">{r.user?.gender === 'female' ? '女性' : r.user?.gender === 'male' ? '男性' : ''}{r.user?.age ? `・${r.user.age}歳` : ''}</span>
                  </td>
                  <td className="py-1 text-sub break-all">{r.page || '—'}</td>
                  <td className="py-1 text-sub">{r.count ? `表示${r.count}回` : r.extra ? Object.entries(r.extra).map(([k, v]) => `${k}:${v}`).join(' ') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrillBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={'px-2.5 py-1 rounded-full text-[11px] font-black border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-card border-border')}>{on ? '▾ ' : '▸ '}{children}</button>
  );
}

export function Mini({ label, value, sub, good, warn }: { label: string; value: string; sub?: string; good?: boolean; warn?: boolean }) {
  return (
    <div className={'rounded-xl border px-2 py-1.5 ' + (warn ? 'bg-red-50 border-red-300' : good ? 'bg-green-light border-green' : 'bg-bg border-border')}>
      <div className="text-[9.5px] font-bold text-sub">{label}</div>
      <div className="text-[15px] font-black leading-tight">{value}</div>
      {sub && <div className="text-[9.5px] text-muted leading-snug truncate">{sub}</div>}
    </div>
  );
}
