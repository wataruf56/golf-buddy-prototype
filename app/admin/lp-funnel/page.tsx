'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminTabs } from '@/components/AdminTabs';
import { FunnelChart, type FunnelStage } from '@/components/FunnelChart';
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
  botExcluded?: number;
  byDevice?: { key: string; users: number }[];
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
  liffFunnel?: {
    open: number; sdk: number; login: number; back: number; auth: number;
    newUser: number; returning: number; signup: number; error: number;
  };
  liffByLp?: Array<{ lp: string; open: number; login: number; back: number; auth: number; newUser: number; returning: number; signup: number; error: number }>;
  liffOrigin?: {
    fromLp: { open: number; login: number; back: number; auth: number; newUser: number; returning: number; error: number };
    fromLine: { open: number; login: number; back: number; auth: number; newUser: number; returning: number; error: number };
  };
  trackFrom?: number;
  signups?: {
    total: number; testExcluded: number; byEntry: { entry: string; n: number }[];
    missingAt: number; sinceTracking: { from: number; n: number };
  };
  clickTargets: { key: string; users: number }[];
  goalTargets: { key: string; users: number }[];
  daily: { date: string; visitors: number; goals: number }[];
  byHour: number[];
};

// 流入経路（users.acquisitionSource）の見せ方。
// 'lp:◯◯'（タグ無しでLPを踏んだ）と 'richmenu:◯◯' は前半で判定する。
function srcLabel(k: string): string {
  if (k === '_pre') return '計測を入れる前の登録';
  if (k === 'line') return 'LINEの中から（印なし）';
  if (k === 'unknown') return '不明';
  if (k.startsWith('lp:')) return `${LP_LABEL[k.slice(3)] || k.slice(3)}（タグ無し）`;
  if (k.startsWith('richmenu:')) return `リッチメニュー ${k.slice(9)}`;
  return k;
}

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
  about: '📖 ゴルトモとは',
  guide: '📝 SEO記事',
  rounds: '⛳ 募集一覧',
};
// LINEへ飛ぶ前にいたLP。'line' は LP を経由せず LINE 内から直接来た人。
const LP_LABEL: Record<string, string> = {
  top: '🏠 普通のLP',
  mbti: '⛳ 診断LP',
  links: '📸 リンクハブ',
  rounds: '⛳ 募集一覧',
  about: '📖 ゴルトモとは',
  guide: '📝 SEO記事',
  line: '💬 LINE内から直接',
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
            {(data.byDevice || []).length > 0 && (
              <> ・ {(data.byDevice || []).map((d) => `${d.key} ${d.users}人`).join(' / ')}</>
            )}
            {(data.botExcluded ?? 0) > 0 && (
              <span className="text-orange font-bold"> ・ 自動ブラウザ {data.botExcluded}人を除外</span>
            )}
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

          {/* 入口から会員までを1本の逆三角形で。ここだけ見れば全体が分かるようにする。 */}
          {(() => {
            const g = (k: string) => data.funnel.find((x) => x.key === k)?.n ?? 0;
            const lp = data.liffOrigin?.fromLp;
            const stages: FunnelStage[] = [
              { key: 'view', label: 'LPに来た', n: g('view'), note: '広告・検索・SNSから' },
              { key: 'd100', label: '最後まで読んだ', n: g('d100') },
              { key: 'click', label: 'ボタンを押した', n: g('click') },
              { key: 'goal', label: 'LINEへ進んだ', n: g('goal'), note: 'LPを出た' },
            ];
            // LIFF側の計測がある期間だけ、その先も1本につなげる
            if (lp && (lp.open > 0 || lp.newUser > 0)) {
              stages.push({ key: 'open', label: 'アプリが開いた', n: lp.open, note: '友だち追加を越えた' });
              stages.push({ key: 'new', label: '🆕 会員になった', n: lp.newUser, goal: true });
            }
            return (
              <Card title="🔻 入口から会員まで" sub="上が入口、下へ行くほど絞られます。段のあいだの赤字がそこで消えた人数">
                <FunnelChart stages={stages} />
                {!lp && (
                  <div className="text-[10.5px] text-muted mt-1 leading-relaxed">
                    ※ LINEへ進んだ先（アプリ起動〜登録）の計測は 2026-08-21 からです。
                  </div>
                )}
              </Card>
            );
          })()}

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

          {/* LINEへ飛んだ後、どこで落ちたか */}
          {data.liffFunnel && (data.liffFunnel.open > 0 || data.liffFunnel.signup > 0 || (data.signups?.total || 0) > 0) && (
            <Card
              title="🔻 LINEへ飛んだ後、どこで落ちたか"
              sub="LPから飛んだ人だけを1人ずつ追跡。最後の「新しく会員になった」だけが本当の登録"
            >
              {(() => {
                const all = data.liffFunnel!;
                // このファネルは「LPから飛んできた人」だけで組む。
                // リッチメニューなどLINEの中から直接開いた人を混ぜると、
                // LPで押した人より起動した人の方が多くなって話が通らなくなる。
                const f = data.liffOrigin ? { ...data.liffOrigin.fromLp, signup: 0 } : all;
                const line = data.liffOrigin?.fromLine;
                const goal = data.funnel.find((x) => x.key === 'goal')?.n || 0;
                // 旧イベント(liff_signup)しか無い期間は、新規と既存を分けられない。
                const legacyOnly = f.newUser === 0 && f.returning === 0 && all.signup > 0;
                const rows: { label: string; n: number; note: string; kind?: 'goal' | 'sub' }[] = [
                  { label: 'LPで「LINEへ」を押した', n: goal, note: 'ここまではLP側の計測' },
                  { label: 'アプリの起動画面まで来た', n: f.open, note: 'LINEアプリの中で開けた＝友だち追加は越えている' },
                  { label: 'LINEログインへ進んだ', n: f.login, note: 'ログインが必要だった人（ログイン済みの人はここを通らない）' },
                  { label: 'ログインから戻ってきた', n: f.back, note: '上との差が「ログイン画面で消えた人」' },
                  { label: 'サーバー認証が通った', n: f.auth, note: 'セッション発行に成功' },
                ];
                if (legacyOnly) {
                  rows.push({ label: 'セッション発行まで到達（旧計測）', n: all.signup, note: '新規と既存を区別していない古い計測値', kind: 'sub' });
                } else {
                  rows.push({ label: '🆕 新しく会員になった', n: f.newUser, note: 'これが本当の登録完了', kind: 'goal' });
                  rows.push({ label: '既存会員の再ログイン', n: f.returning, note: '登録数には数えない（自分のテストもここ）', kind: 'sub' });
                }
                const max = Math.max(...rows.map((r) => r.n), 1);
                return (
                  <>
                    {rows.map((r) => (
                      <div key={r.label} className="py-1.5 border-b border-border last:border-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className={'text-[12.5px] font-bold ' + (r.kind === 'goal' ? 'text-green' : r.kind === 'sub' ? 'text-muted' : '')}>{r.label}</span>
                          <span className="text-[12px] font-black flex-none">{r.n}<span className="text-[10px] text-muted font-normal">人</span></span>
                        </div>
                        <div className="h-2.5 bg-bg rounded overflow-hidden">
                          <div className={'h-full rounded ' + (r.kind === 'goal' ? 'bg-green' : r.kind === 'sub' ? 'bg-border' : 'bg-orange')}
                            style={{ width: `${Math.max(2, Math.round((r.n / max) * 100))}%` }} />
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">{r.note}</div>
                      </div>
                    ))}
                    {f.error > 0 && (
                      <div className="text-[11px] text-red-700 mt-2 font-bold">⚠️ 途中で失敗した人：{f.error}人</div>
                    )}

                    {/* LINEの中から直接開いた人（LPを通っていない） */}
                    {!!line && line.open > 0 && (
                      <div className="mt-3 rounded-lg border border-border bg-bg p-2.5">
                        <div className="text-[11px] font-black mb-1">📱 LINEの中から直接開いた人（上のファネルとは別）</div>
                        <div className="text-[11.5px] leading-relaxed">
                          リッチメニュー・あいさつメッセージ・過去の通知などから開いた人：
                          <b className="text-[13px]">{line.open}人</b>
                          <span className="text-muted">（うち 新規 {line.newUser}人 / 再ログイン {line.returning}人）</span>
                          <br /><span className="text-muted">LPを通っていないので、LPの改善効果には数えません。</span>
                        </div>
                      </div>
                    )}

                    {/* サーバー実測との答え合わせ */}
                    {data.signups && (() => {
                      const su = data.signups!;
                      const tf = su.sinceTracking?.from || 0;
                      const fromYmd = tf ? new Date(tf).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '';
                      // 画面計測は全経路の合計と比べる（LP経由＋LINE内から）
                      const trackedNew = all.newUser;
                      const comparable = su.sinceTracking?.n ?? su.total;
                      return (
                        <div className="mt-3 rounded-lg border border-border bg-bg p-2.5">
                          <div className="text-[11px] font-black mb-1">✅ 答え合わせ（サーバーの実測）</div>
                          <div className="text-[11.5px] leading-relaxed">
                            この期間に実際に作られた会員：<b className="text-green text-[13px]">{su.total}人</b>
                            {su.testExcluded > 0 && (
                              <span className="text-muted">（動作確認用の test_ アカウント {su.testExcluded}件は除いています）</span>
                            )}
                            {legacyOnly ? (
                              <><br /><span className="text-muted">上の「セッション発行」{all.signup}人との差が、既存会員の再ログインです。</span></>
                            ) : tf ? (
                              <>
                                <br />
                                <span className="text-muted">
                                  画面計測（LIFFの段階）は<b className="text-text">{fromYmd}から</b>しか貯まっていません。
                                  同じ期間で比べると<b className="text-text"> 実測{comparable}人 ／ 画面計測{trackedNew}人</b>
                                  {comparable === trackedNew ? '（一致）' : `（差 ${Math.abs(comparable - trackedNew)}人）`}。
                                  {su.total !== comparable && <>それ以前の{su.total - comparable}人は計測を入れる前の登録です。</>}
                                </span>
                              </>
                            ) : null}
                          </div>
                          {su.byEntry.length > 0 && (
                            <div className="mt-2">
                              <div className="text-[10.5px] font-black mb-1">会員になった人の流入経路</div>
                              <div className="flex flex-wrap gap-1.5">
                                {su.byEntry.map((x) => (
                                  <span key={x.entry}
                                    className={'text-[10.5px] font-bold border rounded px-1.5 py-0.5 '
                                      + (x.entry === '_pre' ? 'bg-bg border-hair text-muted' : 'bg-card border-border')}>
                                    {srcLabel(x.entry)}：{x.n}人
                                  </span>
                                ))}
                              </div>
                              <div className="text-[10px] text-muted mt-1 leading-relaxed">
                                「計測を入れる前の登録」は後から調べようがありません。これから登録する人には、
                                タグが無くても「どのLPを踏んだか」「リッチメニューのどこから来たか」が残ります。
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 離脱の読み解き */}
                    {(() => {
                      if (f.open === 0) return <div className="text-[11px] text-muted mt-2 leading-relaxed">まだデータがありません。この計測を入れた時点から貯まります。</div>;
                      const lostAtLogin = Math.max(0, f.login - f.back);
                      const lostBefore = Math.max(0, goal - f.open);
                      const parts: string[] = [];
                      if (lostBefore > 0) parts.push(`LPで押したのに起動画面まで来なかった人が${lostBefore}人（友だち追加の画面などで止まっている可能性）`);
                      if (lostAtLogin > 0) parts.push(`LINEログイン画面から戻って来なかった人が${lostAtLogin}人`);
                      if (!parts.length) return <div className="text-[11px] font-bold mt-2 text-green">目立った離脱はありません。</div>;
                      return (
                        <div className="text-[11px] mt-2 leading-relaxed bg-red-50 border border-red-200 rounded-lg p-2">
                          <b className="text-red-700">落ちている場所</b><br />
                          {parts.map((t, i) => <span key={i}>・{t}<br /></span>)}
                        </div>
                      );
                    })()}

                    {/* 出発したLP別 */}
                    {data.liffByLp && data.liffByLp.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] font-black mb-1">どのLPから飛んだ人か</div>
                        <div className="text-[10px] text-muted mb-1 leading-relaxed">
                          1人を1つの行にだけ数えます（最初に来たLP）。だから縦に足すと上の全体と合います。
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-muted">
                                <th className="text-left font-bold py-1">出発</th>
                                <th className="text-right font-bold py-1">起動</th>
                                <th className="text-right font-bold py-1">認証</th>
                                <th className="text-right font-bold py-1">新規</th>
                                <th className="text-right font-bold py-1">既存</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.liffByLp.map((r) => (
                                <tr key={r.lp} className="border-t border-border">
                                  <td className="py-1 font-bold">{LP_LABEL[r.lp] || r.lp}</td>
                                  <td className="py-1 text-right">{r.open}</td>
                                  <td className="py-1 text-right">{r.auth}</td>
                                  <td className="py-1 text-right font-black text-green">{r.newUser}</td>
                                  <td className="py-1 text-right text-muted">{r.returning}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>
          )}

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
