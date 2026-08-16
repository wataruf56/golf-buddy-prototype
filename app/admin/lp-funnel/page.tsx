'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminTabs } from '@/components/AdminTabs';
import { useSearchParams } from 'next/navigation';

// 管理画面：LP流入ファネル。
// 「どの入口から来た人が、どこまで進んで、どこで落ちたか」を1画面で見る。
// 数字はすべてユニーク（同じ人が何回来ても1人）。最終ゴールはLINE公式への遷移。

type Funnel = { key: string; label: string; n: number };
type EntryRow = { entry: string; view: number; d25: number; d50: number; d75: number; d100: number; click: number; goal: number };
type PageRow = Omit<EntryRow, 'entry'> & { page: string };
type Data = {
  generatedAt: number;
  range: { days: number; from: number; to: number | null; fromYmd: string; toYmd: string; dataFrom: number; dataTo: number };
  abStartedAt?: number;
  scanned: number;
  kpi: {
    visitors: number; sessions: number; goals: number; cvr: number;
    bounced: number; bounceRate: number; readThroughRate: number; ctr: number;
    avgDwellSec: number; avgMaxScroll: number;
    newVisitors: number; returningVisitors: number; mobile: number; desktop: number;
  };
  funnel: Funnel[];
  worstDrop: { from: string; to: string; lost: number; rate: number } | null;
  byEntry: EntryRow[];
  byPage: PageRow[];
  byVariant?: Array<Omit<EntryRow, 'entry'> & { variant: string }>;
  clickTargets: { key: string; users: number }[];
  goalTargets: { key: string; users: number }[];
  daily: { date: string; visitors: number; goals: number }[];
  byHour: number[];
};

const ENTRY_LABEL: Record<string, string> = {
  richmenu: '📱 LINEリッチメニュー',
  instagram: '📷 インスタ',
  search: '🔍 検索（Google等）',
  line: '💬 LINE内',
  internal: '🔗 サイト内の回遊',
  other: '🌐 その他サイト',
  direct: '❓ 直接・不明',
};
const PAGE_LABEL: Record<string, string> = {
  top: '🏠 普通のLP（goltomo.com）',
  mbti: '⛳ ゴルフMBTI診断LP',
  links: '📸 インスタのリンクハブ',
};
const TARGET_LABEL: Record<string, string> = {
  cta_top: '上部「LINEで無料ではじめる」',
  cta_bar: '下部固定バー「LINEで無料ではじめる」',
  cta_final: '最終CTA「LINEで始める →」',
  cta_bottom: '最終CTA',
  cta_line_hub: 'リンクハブ「LINEで友だち追加」',
  cta_findbar: '診断LP 追従バー「ゴルフ友達を探す」',
  cta_signal: '診断LP「LINEで通知を受け取る」',
  rounds_top: '「募集中のラウンドを見る」',
  mbti_link: '「ゴルフ版MBTI診断をしてみる」',
};
const tl = (k: string) => TARGET_LABEL[k] || k;

export default function AdminLpFunnelPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [page, setPage] = useState('');
  // 期間指定（YYYY-MM-DD）。入っていれば days より優先。
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  async function load(t = token, d = days, p = page, f = from, u = to) {
    if (!t) return;
    setLoading(true); setErr('');
    try {
      const qs = new URLSearchParams({ token: t, days: String(d) });
      if (p) qs.set('page', p);
      if (f) qs.set('from', f);
      if (u) qs.set('to', u);
      const r = await fetch(`/api/admin/lp-funnel?${qs}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token, days, page, from, to); /* eslint-disable-next-line */ }, [token, days, page, from, to]);

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const k = data?.kpi;
  const top = data?.funnel?.[0]?.n || 0;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
        <button onClick={() => load()} className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-card shadow-card font-bold">{loading ? '更新中…' : '↻ 更新'}</button>
      </div>
        <AdminTabs token={token} group="lp" current="/admin/lp-funnel" />
      <div className="text-2xl font-black mb-1">🧭 LP流入ファネル</div>
      <div className="text-[11px] text-muted mb-3">
        どの入口から来た人が、どこまで進んで、どこで落ちたか。数字はすべて<b>ユニーク</b>（同じ人が何回来ても1人）。ゴールは<b>LINE公式へ進んだ</b>こと。
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded-xl mb-3 text-[12px]">エラー: {err}</div>}

      {/* 期間・面の切り替え */}
      <div className="flex gap-1.5 mb-2">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={'flex-1 py-1.5 rounded-full text-[11px] font-bold ' + (days === d ? 'bg-green text-white' : 'bg-card text-sub shadow-card')}>
            {d}日
          </button>
        ))}
      </div>
      {/* 期間の指定。入れると上の「7/30/90日」より優先される。 */}
      <div className="bg-card rounded-xl shadow-card p-2.5 mb-2 flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <span className="text-[9.5px] text-muted font-bold mb-0.5">開始日</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-lg border border-border bg-bg" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9.5px] text-muted font-bold mb-0.5">終了日</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-[12px] px-2 py-1 rounded-lg border border-border bg-bg" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-bg border border-border font-bold">クリア</button>
        )}
        {data?.abStartedAt ? (
          <button
            onClick={() => { setFrom(new Date(data.abStartedAt! + 9 * 3600000).toISOString().slice(0, 10)); setTo(''); }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-orange text-white font-bold ml-auto"
          >🆎 A/B開始日から</button>
        ) : null}
      </div>

      <div className="flex gap-1.5 mb-3">
        {([['', 'すべてのLP'], ['top', '普通のLP'], ['mbti', 'MBTI診断'], ['links', 'リンクハブ']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setPage(v)}
            className={'flex-1 py-1.5 rounded-full text-[10.5px] font-bold ' + (page === v ? 'bg-blue text-white' : 'bg-card text-sub shadow-card')}>
            {label}
          </button>
        ))}
      </div>

      {!data && !err && <div className="text-center text-xs text-muted py-8">読み込み中...</div>}

      {data && data.scanned === 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 text-[12px] leading-relaxed">
          まだ計測データがありません。計測はこの機能を入れた時点から始まるので、LPへのアクセスが発生すると数字が入ります。
        </div>
      )}

      {data && data.scanned > 0 && k && (
        <>
          <div className="text-[10.5px] text-muted mb-2">
            対象期間：<b className="text-text">{fmtRange(data)}</b> ・ {data.scanned}件のイベント
          </div>
          {/* 主要KPI */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Kpi label="訪問した人" value={`${k.visitors}人`} sub={`${k.sessions}セッション`} accent="text-green" />
            <Kpi label="LINEへ進んだ" value={`${k.goals}人`} sub={`到達率 ${k.cvr}%`} accent="text-orange" />
            <Kpi label="直帰" value={`${k.bounceRate}%`} sub={`${k.bounced}人が読まずに離脱`} accent="text-red-600" />
            <Kpi label="最後まで読んだ" value={`${k.readThroughRate}%`} sub={`平均到達 ${k.avgMaxScroll}%`} accent="text-blue" />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Kpi label="ボタンを押した" value={`${k.ctr}%`} sub="訪問した人のうち" />
            <Kpi label="平均の滞在" value={`${k.avgDwellSec}秒`} sub="ページを見ていた時間" />
            <Kpi label="新規 / 再訪" value={`${k.newVisitors} / ${k.returningVisitors}`} sub="人" />
            <Kpi label="スマホ / PC" value={`${k.mobile} / ${k.desktop}`} sub="人" />
          </div>

          {/* いちばん落ちている場所 */}
          {data.worstDrop && data.worstDrop.lost > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 mb-3">
              <div className="text-[12px] font-black text-red-700 mb-0.5">⚠️ いちばん落ちているのはここ</div>
              <div className="text-[12.5px] leading-relaxed">
                「{data.worstDrop.from}」→「{data.worstDrop.to}」で <b>{data.worstDrop.lost}人</b>（{data.worstDrop.rate}%）が離脱しています。
              </div>
            </div>
          )}

          {/* ファネル本体 */}
          <Card title="📉 ステップごとの到達" sub="上から順に絞り込まれます。カッコ内は直前のステップからの残存率">
            {data.funnel.map((f, i) => {
              const prev = i === 0 ? f.n : data.funnel[i - 1].n;
              const keep = prev ? Math.round((f.n / prev) * 100) : 0;
              const w = top ? Math.max(2, Math.round((f.n / top) * 100)) : 0;
              const isGoal = f.key === 'goal';
              return (
                <div key={f.key} className="py-1.5 border-b border-border last:border-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className={'text-[12.5px] font-bold ' + (isGoal ? 'text-orange' : '')}>{i + 1}. {f.label}</span>
                    <span className="text-[12px] font-black flex-none">
                      {f.n}<span className="text-[10px] text-muted font-normal">人</span>
                      {i > 0 && <span className={'ml-1.5 text-[10px] font-bold ' + (keep < 50 ? 'text-red-600' : 'text-muted')}>({keep}%)</span>}
                    </span>
                  </div>
                  <div className="h-2.5 bg-bg rounded overflow-hidden">
                    <div className={'h-full rounded ' + (isGoal ? 'bg-orange' : 'bg-green')} style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>

          {/* A/Bテストの比較 */}
          <Card
            title="🆎 CTAのA/Bテスト"
            sub="A=現行（LINE登録が主役）/ B=新案（まず募集を見せる）。割り当ては人ごとに固定"
          >
            {!data.abStartedAt ? (
              <div className="text-[11.5px] leading-relaxed">
                <b>まだ計測が始まっていません。</b><br />
                A/Bテストはこの機能を入れた時点からの計測です。LPへのアクセスが発生すると、ここに案ごとの数字が出ます。
              </div>
            ) : (
              <>
                <div className="text-[10.5px] text-muted mb-2 leading-relaxed">
                  計測開始：<b className="text-text">{new Date(data.abStartedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>
                  {' '}／ この表の対象：{fmtRange(data)}
                </div>
                {(data.byVariant || []).length === 0 ? (
                  <div className="text-[11.5px] text-muted">この期間には、まだどちらの案のデータもありません。</div>
                ) : (
                  <>
                    {(data.byVariant || []).map((r) => {
                      const cvr = r.view ? Math.round((r.goal / r.view) * 1000) / 10 : 0;
                      const label = r.variant === 'a' ? 'A：現行「LINEで無料ではじめる」' : 'B：新案「いまの募集を見てみる」';
                      return (
                        <div key={r.variant} className="py-2 border-b border-border last:border-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={'text-[12px] font-black ' + (r.variant === 'b' ? 'text-orange' : '')}>{label}</span>
                            <span className="text-[12px] font-black flex-none">{cvr}%</span>
                          </div>
                          <div className="text-[10.5px] text-muted mt-0.5">
                            到達 {r.view}人 → 完読 {r.d100}人 → 押した {r.click}人 → <b className="text-orange">LINE {r.goal}人</b>
                          </div>
                          <div className="h-2 bg-bg rounded overflow-hidden mt-1">
                            <div className={'h-full rounded ' + (r.variant === 'b' ? 'bg-orange' : 'bg-green')} style={{ width: `${Math.min(100, cvr * 4)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(() => {
                      // 判断は母数が十分たまってから。少ないうちに「優勢」と言わない。
                      const NEED = 100;
                      const rows = data.byVariant || [];
                      const a = rows.find((r) => r.variant === 'a');
                      const b = rows.find((r) => r.variant === 'b');
                      if (!a || !b) {
                        return <div className="text-[11px] text-muted mt-2 leading-relaxed">まだ片方の案しかデータがありません。両方たまると比較できます。</div>;
                      }
                      const min = Math.min(a.view, b.view);
                      if (min < NEED) {
                        return (
                          <div className="text-[11px] text-muted mt-2 leading-relaxed">
                            ⏳ <b>まだ判断できません。</b>少ない人数だと、差が出ていても偶然のことがあります。
                            それぞれ {NEED}人に達したら比べてください（いま少ない方で {min}人 ／ あと {NEED - min}人）。
                          </div>
                        );
                      }
                      const ca = a.goal / a.view, cb = b.goal / b.view;
                      const diff = Math.abs(ca - cb) * 100;
                      if (diff < 1) return <div className="text-[11px] font-bold mt-2">いまのところ差はほとんどありません（どちらも同程度）。</div>;
                      const win = cb > ca ? 'B（新案）' : 'A（現行）';
                      return (
                        <div className="text-[11px] font-bold mt-2">
                          いまのところ <span className="text-orange">{win}</span> の方が {diff.toFixed(1)}ポイント高いです。
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </Card>

          {/* 入口別 */}
          <Card title="🚪 入口別のファネル" sub="どこから来た人が、どこまで進んだか（ユニーク）">
            {data.byEntry.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted text-left border-b border-border">
                      <th className="py-1.5 pr-2 font-bold">入口</th>
                      <th className="py-1.5 px-1 text-right font-bold">到達</th>
                      <th className="py-1.5 px-1 text-right font-bold">50%</th>
                      <th className="py-1.5 px-1 text-right font-bold">完読</th>
                      <th className="py-1.5 px-1 text-right font-bold">押した</th>
                      <th className="py-1.5 pl-1 text-right font-bold">LINE</th>
                      <th className="py-1.5 pl-1 text-right font-bold">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byEntry.map((r) => (
                      <tr key={r.entry} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-2">{ENTRY_LABEL[r.entry] || r.entry}</td>
                        <td className="py-1.5 px-1 text-right font-bold">{r.view}</td>
                        <td className="py-1.5 px-1 text-right">{r.d50}</td>
                        <td className="py-1.5 px-1 text-right">{r.d100}</td>
                        <td className="py-1.5 px-1 text-right">{r.click}</td>
                        <td className="py-1.5 pl-1 text-right font-black text-orange">{r.goal}</td>
                        <td className="py-1.5 pl-1 text-right text-green font-bold">{r.view ? Math.round((r.goal / r.view) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 面別 */}
          <Card title="📄 LP別のファネル" sub="どのページが登録につながっているか">
            {data.byPage.length === 0 ? <Empty /> : data.byPage.map((r) => (
              <div key={r.page} className="py-2 border-b border-border last:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-bold">{PAGE_LABEL[r.page] || r.page}</span>
                  <span className="text-[11px] font-black">{r.view}人 → <span className="text-orange">{r.goal}人</span></span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">
                  完読 {r.d100}人 ・ ボタン {r.click}人 ・ CVR {r.view ? Math.round((r.goal / r.view) * 100) : 0}%
                </div>
              </div>
            ))}
          </Card>

          {/* ボタン別 */}
          <Card title="👆 押されたボタン" sub="押した人数（ユニーク）">
            {data.clickTargets.length === 0 ? <Empty /> : (() => {
              const max = data.clickTargets[0].users || 1;
              return data.clickTargets.map((t) => (
                <div key={t.key} className="py-1.5 border-b border-border last:border-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11.5px] font-bold">{tl(t.key)}</span>
                    <span className="text-[11px] font-black flex-none">{t.users}人</span>
                  </div>
                  <div className="h-2 bg-bg rounded overflow-hidden">
                    <div className="h-full bg-blue rounded" style={{ width: `${Math.round((t.users / max) * 100)}%` }} />
                  </div>
                </div>
              ));
            })()}
          </Card>

          {/* 日別 */}
          {data.daily.length > 0 && (
            <Card title="📅 日別" sub="訪問した人 / LINEへ進んだ人（ユニーク）">
              {data.daily.slice(-14).map((d) => (
                <div key={d.date} className="flex items-center justify-between text-[11px] py-1 border-b border-border last:border-0">
                  <span className="text-sub">{d.date.slice(5).replace('-', '/')}</span>
                  <span>訪問 <b>{d.visitors}</b>人 ・ LINE <b className="text-orange">{d.goals}</b>人</span>
                </div>
              ))}
            </Card>
          )}

          <div className="text-[10px] text-muted text-center mt-3">
            集計 {data.scanned} イベント ・ {new Date(data.generatedAt).toLocaleString('ja-JP')}
          </div>
        </>
      )}
    </div>
  );
}

// 「いつからいつまでのデータか」を1行で表す。
function fmtRange(d: Data): string {
  const f = (ms: number) => new Date(ms).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  if (d.range?.fromYmd || d.range?.toYmd) {
    const a = d.range.fromYmd ? d.range.fromYmd.slice(5).replace('-', '/') : '最初';
    const b = d.range.toYmd ? d.range.toYmd.slice(5).replace('-', '/') : '今';
    return `${a} 〜 ${b}`;
  }
  if (d.range?.dataFrom && d.range?.dataTo) return `${f(d.range.dataFrom)} 〜 ${f(d.range.dataTo)}（直近${d.range.days}日）`;
  return `直近${d.range?.days ?? 30}日`;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl p-3 shadow-card">
      <div className="text-[10px] text-muted font-bold">{label}</div>
      <div className={`text-[19px] font-black leading-tight ${accent || ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-card p-3.5 mb-3">
      <div className="font-black text-[13px]">{title}</div>
      {sub && <div className="text-[10.5px] text-muted mb-1.5">{sub}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Empty() {
  return <div className="text-[11px] text-muted py-3 text-center">データがありません</div>;
}
