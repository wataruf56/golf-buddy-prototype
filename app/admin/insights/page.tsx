'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：📊 計測ハブ（2026-10-12）
// 数字を見る場所をここに集める。
//   ① 全体の数字（/api/admin/kpi）……今週ラウンドした人・募集数・満員率・リピート率・活性化
//   ② ポップアップの反応（/api/admin/popups）……ポップアップごとに、出した人数・何を押したか・成果率・何もしなかった人・操作までの時間・日別
//   ③ 募集のイチオシの効果（/api/admin/promo-popup）
//   ④ ほかの計測へ（利用状況・LP・LINE配信・再会・操作ログ）
export default function AdminInsightsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type PopupRow = {
  id: string; name: string; emoji: string; who: string; forced: boolean;
  actionLabels: Record<string, string>; goal: string[];
  shows: number; shownUsers: number; goalUsers: number; goalRate: number | null;
  noAction: number; noActionRate: number | null; medianSec: number | null;
  actions: Record<string, { count: number; users: number }>;
  daily: Array<{ day: string; shows: number; goals: number }>; lastAt: number;
};
type Kpi = any;
type Promo = { id: string; approved: boolean; showAt: number; until?: number; headline?: string; round: { title: string; date: string; status: string } | null; stats: { seen: number; go: number; joined: number } };

const fmtSec = (s: number | null) => (s == null ? '—' : s < 60 ? `${s}秒` : s < 3600 ? `${Math.round(s / 60)}分` : `${Math.round(s / 3600)}時間`);
const fmtAt = (ms: number) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [days, setDays] = useState(30);
  const [withTest, setWithTest] = useState(false);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [popups, setPopups] = useState<PopupRow[] | null>(null);
  const [totals, setTotals] = useState<{ events: number; shows: number; users: number } | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = search?.get('token') || (typeof window !== 'undefined' ? localStorage.getItem('gb_admin_token') || '' : '');
    if (t) setToken(t);
  }, [search]);

  useEffect(() => {
    if (!token) return;
    const q = `token=${encodeURIComponent(token)}`;
    setErr('');
    fetch(`/api/admin/kpi?${q}`, { cache: 'no-store' }).then((r) => r.json()).then(setKpi).catch(() => {});
    fetch(`/api/admin/promo-popup?${q}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => setPromos(j.promos || [])).catch(() => {});
    setPopups(null);
    fetch(`/api/admin/popups?${q}&days=${days}${withTest ? '&test=1' : ''}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); setPopups(j.popups || []); setTotals(j.totals || null); })
      .catch((e) => setErr(String(e)));
  }, [token, days, withTest]);

  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const sorted = (popups || []).slice().sort((a, b) => b.shownUsers - a.shownUsers || a.name.localeCompare(b.name));

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <Link href={`/admin${qs}`} className="text-sm text-blue font-bold">← 管理トップ</Link>
      <div className="flex items-end justify-between flex-wrap gap-2 mt-2">
        <h1 className="text-2xl font-black">📊 計測ハブ</h1>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={'px-3 py-1.5 rounded-full text-[12px] font-black border-[1.5px] ' + (days === d ? 'bg-green text-white border-green' : 'bg-card border-border')}>{d}日</button>
          ))}
          <label className="ml-2 text-[11px] font-bold text-sub flex items-center gap-1">
            <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} /> テスト垢も含める
          </label>
        </div>
      </div>

      {/* ① 全体の数字 */}
      <SectionTitle emoji="🌟" title="全体の数字" sub="ラウンドが回っているか（今週／先週）" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="今週ラウンドした人" value={kpi?.northStar?.thisWeek} sub={kpi ? `先週 ${kpi.northStar?.lastWeek ?? '—'}人` : ''} accent />
        <Kpi label="今週の新しい募集" value={kpi?.supply?.roundsThisWeek} sub={kpi ? `先週 ${kpi.supply?.roundsLastWeek ?? '—'}件` : ''} />
        <Kpi label="今週の満員率" value={kpi?.matching?.fillRateThisWeek != null ? `${kpi.matching.fillRateThisWeek}%` : undefined} sub={kpi ? `全期間 ${kpi.matching?.fillRateAll ?? '—'}%` : ''} />
        <Kpi label="リピート率" value={kpi?.retention?.repeatRate != null ? `${kpi.retention.repeatRate}%` : undefined} sub={kpi ? `${kpi.retention?.repeat ?? 0}/${kpi.retention?.everPlayed ?? 0}人が2回以上` : ''} />
      </div>

      {/* ② ポップアップの反応 */}
      <SectionTitle emoji="🪟" title="ポップアップの反応" sub={`過去${days}日。出した人数・押したもの・成果率（目的の操作をした人の割合）・何もしなかった人・操作までの時間`} />
      {totals && (
        <div className="text-[11px] text-sub mb-2">記録 {totals.events.toLocaleString()}件（表示 {totals.shows.toLocaleString()}回・{totals.users}人）。記録は 2026-10-12 から。「何もしなかった」＝表示されたが、閉じる・選ぶ操作の記録がない人（アプリを閉じた・ページを移った）。</div>
      )}
      {err && <div className="text-[12px] text-red-600 mb-2">読み込みエラー：{err}</div>}
      {!popups ? <div className="text-[12px] text-muted">読み込み中…</div> : (
        <div className="flex flex-col gap-2">
          {sorted.map((p) => {
            const max = Math.max(1, ...p.daily.map((d) => d.shows));
            const isOpen = open === p.id;
            const acts = Object.entries(p.actions).sort((a, b) => b[1].users - a[1].users);
            return (
              <div key={p.id} className="bg-card rounded-card shadow-card border-2 border-border overflow-hidden">
                <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="w-full text-left p-3.5">
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
                    {acts.length === 0 ? <div className="text-[12px] text-muted">まだ操作の記録がありません</div> : (
                      <table className="w-full text-[12px]">
                        <thead><tr className="text-sub text-left"><th className="py-1 font-bold">押したもの</th><th className="py-1 font-bold text-right">人数</th><th className="py-1 font-bold text-right">出した人のうち</th><th className="py-1 font-bold text-right">回数</th></tr></thead>
                        <tbody>
                          {acts.map(([a, v]) => (
                            <tr key={a} className="border-t border-hair">
                              <td className="py-1.5">{p.goal.includes(a) && '🎯 '}{p.actionLabels[a] || a}<span className="text-[10px] text-muted ml-1">{a}</span></td>
                              <td className="py-1.5 text-right font-black">{v.users}人</td>
                              <td className="py-1.5 text-right">{p.shownUsers ? `${Math.round((v.users / p.shownUsers) * 100)}%` : '—'}</td>
                              <td className="py-1.5 text-right text-sub">{v.count}回</td>
                            </tr>
                          ))}
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
      )}

      {/* ③ 募集のイチオシ */}
      <SectionTitle emoji="🔥" title="募集のイチオシの効果" sub="表示した人 → 「参加してみる」を押した人 → その後に申請・参加した人" />
      {promos.length === 0 ? <div className="text-[12px] text-muted">まだありません。<Link href={`/admin/promo${qs}`} className="text-blue font-bold">イチオシを作る →</Link></div> : (
        <div className="flex flex-col gap-1.5">
          {promos.slice(0, 6).map((p) => (
            <div key={p.id} className="bg-card rounded-xl border-2 border-border px-3 py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold truncate">{p.round ? `${p.round.date.slice(5).replace('-', '/')} ${p.round.title}` : p.id}</div>
                <div className="text-[10.5px] text-muted">{fmtAt(p.showAt)}〜 {p.approved ? '' : '（停止中）'}</div>
              </div>
              <Funnel a={p.stats.seen} b={p.stats.go} c={p.stats.joined} />
            </div>
          ))}
          <Link href={`/admin/promo${qs}`} className="text-[12px] text-blue font-bold">→ イチオシの管理・作成</Link>
        </div>
      )}

      {/* ④ ほかの計測 */}
      <SectionTitle emoji="🧭" title="ほかの計測" sub="くわしく見るときはこちら" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-10">
        {[
          { href: `/admin/activity${qs}`, emoji: '📈', title: '利用状況', desc: 'よく開かれる画面・アクティブ会員・登録の推移' },
          { href: `/admin/analytics${qs}`, emoji: '🕒', title: 'アクセス分析', desc: '時間帯・カレンダー' },
          { href: `/admin/lp-funnel${qs}`, emoji: '🧭', title: 'LP・診断の流入', desc: '入口別のファネル・離脱' },
          { href: `/admin/line-stats${qs}`, emoji: '📨', title: 'LINE配信の通数', desc: '種別ごと・月別' },
          { href: `/admin/rematch${qs}`, emoji: '🔁', title: '再会のファネル', desc: '通知→候補入力→決定' },
          { href: `/admin/audit${qs}`, emoji: '📒', title: '操作ログ', desc: '誰が・誰に・何をしたか' },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="bg-card rounded-card shadow-card border-2 border-border p-3">
            <div className="text-[18px]">{c.emoji}</div>
            <div className="text-[13px] font-black mt-0.5">{c.title}</div>
            <div className="text-[10.5px] text-sub leading-snug mt-0.5">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="mt-7 mb-2.5">
      <div className="text-[17px] font-black">{emoji} {title}</div>
      {sub && <div className="text-[11px] text-sub mt-0.5">{sub}</div>}
    </div>
  );
}
function Kpi({ label, value, sub, accent }: { label: string; value?: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={'rounded-card border-2 border-border shadow-card p-3 ' + (accent ? 'bg-green-light' : 'bg-card')}>
      <div className="text-[10.5px] font-bold text-sub">{label}</div>
      <div className="text-[22px] font-black leading-tight mt-0.5">{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
function Mini({ label, value, sub, good, warn }: { label: string; value: string; sub?: string; good?: boolean; warn?: boolean }) {
  return (
    <div className={'rounded-xl border px-2 py-1.5 ' + (warn ? 'bg-red-50 border-red-300' : good ? 'bg-green-light border-green' : 'bg-bg border-border')}>
      <div className="text-[9.5px] font-bold text-sub">{label}</div>
      <div className="text-[15px] font-black leading-tight">{value}</div>
      {sub && <div className="text-[9.5px] text-muted leading-snug truncate">{sub}</div>}
    </div>
  );
}
function Funnel({ a, b, c }: { a: number; b: number; c: number }) {
  const r = (x: number) => (a ? `${Math.round((x / a) * 100)}%` : '—');
  return (
    <div className="flex items-center gap-1 text-[11px] font-black flex-none">
      <span className="px-2 py-1 rounded-lg bg-bg border border-border">表示 {a}</span>→
      <span className="px-2 py-1 rounded-lg bg-orange-light border border-orange text-orange">押した {b}<span className="font-bold text-[9.5px] ml-0.5">{r(b)}</span></span>→
      <span className="px-2 py-1 rounded-lg bg-green-light border border-green text-green">申請 {c}<span className="font-bold text-[9.5px] ml-0.5">{r(c)}</span></span>
    </div>
  );
}
