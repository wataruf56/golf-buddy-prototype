'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getGolmotiType } from '@/lib/golmoti';

// 管理画面：LP診断レポート。/api/lp/quiz の集計（ADMIN_LOG_TOKEN 保護）を
// 取得して、来訪〜診断〜興味シグナルのファネル・需要プール・離脱を可視化する。

type Report = {
  scanned: number;
  uniqueSessions: number;
  uniqueVisitors: number;
  visits: number;
  starts: number;
  completes: number;
  uniqueStarts: number;
  uniqueCompletes: number;
  signals: number;
  ctas: number;
  shares: number;
  completionRate: number | null;
  signalRate: number | null;
  uniqueSignalVisitors: number;
  linkedSignals: number;
  linkedUsers: number;
  byResult: Record<string, number>;
  byPattern: Record<string, number>;
  byOption: Record<string, Record<string, number>>;
  stepReach: Record<string, number>;
  demand: {
    areaCounts: Record<string, number>;
    dayCounts: Record<string, number>;
    comboCounts: Record<string, number>;
    pickupCounts: Record<string, number>;
    pickupPlaceCounts: Record<string, number>;
  };
  daily: { date: string; visit: number; start: number; complete: number; signal: number }[];
  byRef: Record<string, number>;
  byDevice: { mobile: number; desktop: number };
  byHour: number[];
  raw: RawEvent[];
  serverTime: string;
};

type RawEvent = {
  id: string; ts: number; event: string; visitorId: string; sessionId: string;
  resultType: string; qid: string; optionLabel: string; page: string; ref: string; ua: string;
};

export default function AdminLpReport() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'analysis' | 'data'>('overview');

  // 他の管理画面と同じトークン取得パターン（/api/admin/init を正とする）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const t: string = j?.token || '';
        if (t) { localStorage.setItem('gb_admin_token', t); setToken(t); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  async function load(t: string) {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/lp/quiz?token=${encodeURIComponent(t)}&limit=20000`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error || `エラー (${r.status})`); setData(null); }
      else setData(j as Report);
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }

  useEffect(() => { if (token) load(token); }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center">
        <div className="text-sm text-muted">⚙️ 読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      </div>
      <div className="text-2xl font-black mb-1">📊 LP診断レポート</div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] text-muted">
          {data ? `集計 ${data.scanned} イベント` : '—'}
          {data?.serverTime && ` ・ ${new Date(data.serverTime).toLocaleString('ja-JP', { hour12: false })}`}
        </div>
        <button onClick={() => load(token)} className="text-[11px] px-2.5 py-1 rounded-full bg-card shadow-card font-bold">
          {loading ? '更新中…' : '↻ 更新'}
        </button>
      </div>

      {err && <div className="p-3 bg-red-light text-red rounded-xl text-sm mb-4">取得失敗: {err}</div>}
      {!data && !err && <div className="text-sm text-muted">読み込み中...</div>}

      {data && (
        <div className="flex flex-col gap-4">
          {/* 上部タブで切替（概要 / 分析 / データ管理） */}
          <div className="flex gap-1.5 bg-card rounded-full p-1 shadow-card sticky top-2 z-10">
            {([['overview', '📈 概要'], ['analysis', '🔍 分析'], ['data', '🗑 データ管理']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={'flex-1 py-2 rounded-full text-[12px] font-bold transition-colors ' + (tab === k ? 'bg-green text-white' : 'text-sub')}
              >{label}</button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <StatGrid data={data} />
              <Funnel data={data} />
              <UniqueBreakdown data={data} />
              <Daily daily={data.daily} />
              <Demand demand={data.demand} signals={data.signals} uniq={data.uniqueSignalVisitors} />
            </>
          )}
          {tab === 'analysis' && (
            <>
              <ResultDist byResult={data.byResult} completes={data.completes} />
              <OptionBreakdown byOption={data.byOption} />
              <DropOff stepReach={data.stepReach} starts={data.starts} />
              <Sources byRef={data.byRef} />
              <Devices byDevice={data.byDevice} />
              <Hours byHour={data.byHour} />
              <Patterns byPattern={data.byPattern} />
            </>
          )}
          {tab === 'data' && (
            <VisitorManager raw={data.raw} token={token} onChanged={() => load(token)} />
          )}

          <div className="text-[10px] text-muted text-center mt-2">
            ※ 直近 {data.scanned} 件のイベントを集計。
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-4">
      <div className="text-sm font-black mb-0.5">{title}</div>
      {sub && <div className="text-[11px] text-muted mb-3">{sub}</div>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function Bar({ label, value, max, hint, color = 'bg-green' }: { label: string; value: number; max: number; hint?: string; color?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex justify-between items-baseline mb-1 gap-2">
        <span className="text-[12px] font-semibold truncate">{label}</span>
        <span className="text-[12px] font-black flex-shrink-0">{value}{hint && <span className="text-muted font-medium text-[10px] ml-1">{hint}</span>}</span>
      </div>
      <div className="w-full h-2 bg-bg rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Funnel({ data }: { data: Report }) {
  const base = Math.max(data.uniqueVisitors, data.uniqueStarts, 1);
  return (
    <Card title="ファネル（訪問 → 診断 → 通知登録）" sub="すべてユニーク（1人1カウント）">
      <Bar label="ユニーク訪問者" value={data.uniqueVisitors} max={base} hint="人" color="bg-blue" />
      <Bar label="診断スタート（1問目回答）" value={data.uniqueStarts} max={base} hint={`訪問比 ${pct(data.uniqueStarts, data.uniqueVisitors)}%`} color="bg-green" />
      <Bar label="診断完了" value={data.uniqueCompletes} max={base} hint={`完了率 ${pct(data.uniqueCompletes, data.uniqueStarts)}%`} color="bg-green" />
      <Bar label="興味シグナル登録" value={data.signals} max={base} hint={`完了比 ${Math.round((data.signalRate || 0) * 100)}%`} color="bg-orange" />
      <Bar label="CTAクリック" value={data.ctas} max={base} color="bg-orange" />
      <Bar label="シェア" value={data.shares} max={base} color="bg-blue" />
      <div className="mt-3 pt-3 border-t border-border text-[11px] text-sub flex flex-col gap-1">
        <div>通知登録したユニーク人数（匿名）：<b className="text-text">{data.uniqueSignalVisitors}</b> 人</div>
        <div>
          LINEアカウント紐付け済み：<b className="text-green">{data.linkedUsers ?? 0}</b> 人
          <span className="text-muted">（{data.linkedSignals ?? 0} 件）</span>
        </div>
      </div>
    </Card>
  );
}

function Daily({ daily }: { daily: Report['daily'] }) {
  const rows = daily.slice(-14);
  const max = Math.max(1, ...rows.map((r) => r.visit));
  if (!rows.length) return null;
  return (
    <Card title="日次の動き（直近14日 / JST）" sub="灰=来訪・緑=完了・橙=通知登録">
      <div className="flex items-end gap-1 h-28">
        {rows.map((r) => (
          <div key={r.date} className="flex-1 flex flex-col items-center justify-end gap-px h-full" title={`${r.date}  来訪${r.visit} 完了${r.complete} 登録${r.signal}`}>
            <div className="w-full flex flex-col justify-end items-center gap-px h-full">
              <div className="w-full bg-[#D5DDE0] rounded-t" style={{ height: `${pct(r.visit, max)}%` }} />
              <div className="w-full bg-green" style={{ height: `${pct(r.complete, max)}%` }} />
              <div className="w-full bg-orange rounded-b" style={{ height: `${pct(r.signal, max)}%` }} />
            </div>
            <div className="text-[8px] text-muted whitespace-nowrap">{r.date.slice(5)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function sortEntries(o: Record<string, number>) {
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
}

function Demand({ demand, signals, uniq }: { demand: Report['demand']; signals: number; uniq: number }) {
  const combos = sortEntries(demand.comboCounts).slice(0, 8);
  const areas = sortEntries(demand.areaCounts);
  const days = sortEntries(demand.dayCounts);
  const maxC = combos.length ? combos[0][1] : 1;
  const maxA = areas.length ? areas[0][1] : 1;
  return (
    <Card title="需要プール（エリア × 曜日）" sub={`通知登録 ${signals} 件 / ${uniq} 人が「ここで募集が欲しい」と意思表示`}>
      {signals === 0 ? (
        <div className="text-[12px] text-muted">まだ興味シグナルの登録がありません。</div>
      ) : (
        <>
          <div className="text-[11px] font-bold text-sub mb-2">「◯人待ち」上位の組み合わせ</div>
          {combos.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxC} hint="人待ち" color="bg-orange" />)}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
            <div>
              <div className="text-[11px] font-bold text-sub mb-2">エリア別</div>
              {areas.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxA} color="bg-green" />)}
            </div>
            <div>
              <div className="text-[11px] font-bold text-sub mb-2">曜日別</div>
              {days.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxA} color="bg-blue" />)}
            </div>
          </div>
          {(() => {
            const pk = sortEntries(demand.pickupCounts || {});
            if (!pk.length) return null;
            const maxP = pk[0][1];
            return (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[11px] font-bold text-sub mb-2">🚗 クルマ・送迎の希望</div>
                {pk.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxP} hint={`${pct(v, signals)}%`} color="bg-orange" />)}
              </div>
            );
          })()}
          {(() => {
            const pl = sortEntries(demand.pickupPlaceCounts || {});
            if (!pl.length) return null;
            const maxPl = pl[0][1];
            return (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[11px] font-bold text-sub mb-2">🚉 ピックアップ希望の場所（駅）</div>
                {pl.map(([k, v]) => <Bar key={k} label={`${k}駅`} value={v} max={maxPl} color="bg-green" />)}
              </div>
            );
          })()}
        </>
      )}
    </Card>
  );
}

// 設問ごとの回答分布（事業判断に効く「ユーザーの傾向」）。
function OptionBreakdown({ byOption }: { byOption: Record<string, Record<string, number>> }) {
  const qids = Object.keys(byOption || {}).sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
  if (!qids.length) return null;
  return (
    <Card title="設問ごとの回答傾向" sub="各問でどの選択肢が選ばれたか">
      <div className="flex flex-col gap-3">
        {qids.map((q) => {
          const opts = sortEntries(byOption[q]);
          const total = opts.reduce((s, [, v]) => s + v, 0) || 1;
          const max = opts.length ? opts[0][1] : 1;
          return (
            <div key={q}>
              <div className="text-[11px] font-black text-sub mb-1.5">{q.toUpperCase()}</div>
              {opts.map(([label, v]) => (
                <Bar key={label} label={label.replace(/^\S+\s/, '')} value={v} max={max} hint={`${pct(v, total)}%`} color="bg-green" />
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DropOff({ stepReach, starts }: { stepReach: Record<string, number>; starts: number }) {
  const steps = Object.keys(stepReach)
    .map((q) => ({ q, n: stepReach[q], i: parseInt(q.replace(/\D/g, ''), 10) || 0 }))
    .sort((a, b) => a.i - b.i);
  if (!steps.length) return null;
  const base = Math.max(starts, steps[0]?.n || 1);
  return (
    <Card title="設問ごとの到達（離脱分析）" sub="どの設問で抜けているかが分かります">
      <Bar label="スタート" value={starts} max={base} color="bg-blue" />
      {steps.map((s) => (
        <Bar key={s.q} label={`Q${s.i}`} value={s.n} max={base} hint={`到達 ${pct(s.n, starts)}%`} color="bg-green" />
      ))}
    </Card>
  );
}

function ResultDist({ byResult, completes }: { byResult: Record<string, number>; completes: number }) {
  const rows = sortEntries(byResult);
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <Card title="診断結果タイプの分布" sub={`完了 ${completes} 件の内訳`}>
      {rows.map(([code, v]) => {
        const t = getGolmotiType(code);
        const label = t ? `${t.emoji} ${t.name}` : code;
        return <Bar key={code} label={label} value={v} max={max} hint={`${pct(v, completes)}%`} color="bg-green" />;
      })}
    </Card>
  );
}

function Patterns({ byPattern }: { byPattern: Record<string, number> }) {
  const rows = sortEntries(byPattern).slice(0, 8);
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <Card title="多い回答パターン Top8" sub="完全一致の回答列（q1:..,q2:..）">
      {rows.map(([p, v]) => (
        <div key={p} className="mb-2.5 last:mb-0">
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <span className="text-[10px] font-mono text-sub truncate">{p}</span>
            <span className="text-[12px] font-black flex-shrink-0">{v}</span>
          </div>
          <div className="w-full h-1.5 bg-bg rounded overflow-hidden">
            <div className="h-full bg-blue rounded" style={{ width: `${pct(v, max)}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

// 大きな数値カード（まず一番見たい指標をしっかり表示）
function StatGrid({ data }: { data: Report }) {
  const cells = [
    { label: 'ユニーク訪問者', value: data.uniqueVisitors, sub: '人', color: 'text-blue' },
    { label: '診断スタート', value: data.uniqueStarts, sub: `訪問比 ${pct(data.uniqueStarts, data.uniqueVisitors)}%`, color: 'text-text' },
    { label: '診断完了', value: data.uniqueCompletes, sub: `完了率 ${pct(data.uniqueCompletes, data.uniqueStarts)}%`, color: 'text-green' },
    { label: '興味シグナル', value: data.uniqueSignalVisitors, sub: `${data.signals}件`, color: 'text-orange' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cells.map((c) => (
        <div key={c.label} className="bg-card rounded-xl shadow-card p-3.5">
          <div className="text-[11px] text-sub font-bold mb-0.5">{c.label}</div>
          <div className={`text-[30px] leading-none font-black ${c.color}`}>{c.value}</div>
          <div className="text-[10px] text-muted mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ユニーク（1人1カウント）と 延べ（同じ人の複数回も全部）を並べて確認する
// レポート。同じ人が何度も診断しても、上のファネルはユニークで数えていることを
// あとから検証できる。
function UniqueBreakdown({ data }: { data: Report }) {
  const rows = [
    { label: '診断スタート', uniq: data.uniqueStarts, total: data.starts },
    { label: '診断完了', uniq: data.uniqueCompletes, total: data.completes },
    { label: '興味シグナル', uniq: data.uniqueSignalVisitors, total: data.signals },
  ];
  return (
    <Card title="ユニーク／延べ の内訳" sub="同じ人の複数回診断を除いた「ユニーク」と、全カウント「延べ」">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="text-[10px] text-muted font-bold text-left">項目</div>
        <div className="text-[10px] text-muted font-bold">ユニーク</div>
        <div className="text-[10px] text-muted font-bold">延べ（全回数）</div>
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <div className="text-[12px] font-bold text-left border-t border-border pt-1.5">{r.label}</div>
            <div className="text-[15px] font-black text-green border-t border-border pt-1.5">{r.uniq}</div>
            <div className="text-[13px] font-bold text-muted border-t border-border pt-1.5">{r.total}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted mt-2">※ ファネル・上部カードは「ユニーク」を表示。延べはあなたの複数回テストなども含む全数。</div>
    </Card>
  );
}

function Sources({ byRef }: { byRef: Record<string, number> }) {
  const rows = sortEntries(byRef || {});
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <Card title="流入元（来訪の参照元）" sub="どこから来たか">
      {rows.map(([k, v]) => <Bar key={k} label={k} value={v} max={max} color="bg-blue" />)}
      <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted leading-relaxed">
        💡「直接 / 不明」= 参照元(リファラ)が無い来訪です。具体的には:<br />
        ・URL直打ち / ブックマーク / QR読み取り<br />
        ・<b>LINEのトーク・リッチメニューから開いた場合</b>（LINE内ブラウザはリファラを送らないことが多い）<br />
        ・他アプリやメールのリンク経由<br />
        ＝ 多くは「LINEや直接アクセス」と考えてOKです。「その他」は判別できなかった外部サイトです。
      </div>
    </Card>
  );
}

function Devices({ byDevice }: { byDevice: { mobile: number; desktop: number } }) {
  const m = byDevice?.mobile || 0, d = byDevice?.desktop || 0;
  const total = m + d;
  if (total === 0) return null;
  return (
    <Card title="デバイス" sub={`来訪 ${total} 件の内訳`}>
      <Bar label="📱 スマホ" value={m} max={total} hint={`${pct(m, total)}%`} color="bg-green" />
      <Bar label="💻 PC" value={d} max={total} hint={`${pct(d, total)}%`} color="bg-blue" />
    </Card>
  );
}

function Hours({ byHour }: { byHour: number[] }) {
  const arr = Array.isArray(byHour) ? byHour : [];
  const max = Math.max(1, ...arr);
  if (arr.reduce((a, b) => a + b, 0) === 0) return null;
  return (
    <Card title="時間帯（来訪・JST）" sub="アクセスが多い時間">
      <div className="flex items-end gap-px h-24">
        {arr.map((v, h) => (
          <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}時: ${v}`}>
            <div className="w-full bg-green rounded-t" style={{ height: `${pct(v, max)}%` }} />
            {h % 6 === 0 && <div className="text-[7px] text-muted mt-0.5">{h}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

const EVENT_LABEL: Record<string, string> = {
  visit: '来訪', start: '開始', answer: '回答', complete: '完了', signal: 'シグナル',
  cta: 'CTA', share: 'シェア', viewShared: '共有閲覧', typeView: 'タイプ閲覧', linkLine: 'LINE紐付',
};

// データ管理：ユニーク訪問者ごとにまとめて表示。クリックで詳細（イベント一覧）を
// 展開し、訪問者単位の一括削除／1件削除ができる。
function VisitorManager({ raw, token, onChanged }: { raw: RawEvent[]; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string>('');

  async function del(body: any, label: string) {
    if (!confirm(`${label}を削除します。元に戻せません。よろしいですか？`)) return;
    setBusy(JSON.stringify(body));
    try {
      const r = await fetch(`/api/lp/quiz?token=${encodeURIComponent(token)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
      });
      const d = await r.json();
      if (!r.ok) alert('削除失敗: ' + (d.error || r.status));
      else {
        const parts = [`計測ログ ${d.deleted ?? 0}件`];
        if (typeof d.deletedSignals === 'number') parts.push(`LINE通知データ ${d.deletedSignals}件`);
        alert(`データベースから削除しました（${parts.join(' / ')}）`);
        onChanged();
      }
    } catch { alert('削除に失敗しました'); }
    finally { setBusy(''); }
  }

  // 訪問者IDでグループ化
  const groups = useMemo(() => {
    const m: Record<string, RawEvent[]> = {};
    for (const e of raw || []) {
      const k = e.visitorId || '__novid__';
      (m[k] = m[k] || []).push(e);
    }
    return Object.entries(m)
      .map(([vid, evs]) => {
        const sorted = [...evs].sort((a, b) => b.ts - a.ts);
        const completed = evs.find((e) => e.event === 'complete');
        return {
          vid,
          events: sorted,
          count: evs.length,
          lastTs: sorted[0]?.ts || 0,
          resultType: completed?.resultType || '',
          hasComplete: !!completed,
        };
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [raw]);

  if (!raw || raw.length === 0) return <Card title="🗑 データ管理"><div className="text-[12px] text-muted py-4 text-center">データがありません</div></Card>;

  return (
    <Card title="🗑 データ管理（訪問者ごと）" sub={`最新イベントから ${groups.length} 名分。タップで詳細・削除`}>
      <div className="flex flex-col gap-1.5">
        {groups.map((g) => {
          const isOpen = open === g.vid;
          const isNoVid = g.vid === '__novid__';
          return (
            <div key={g.vid} className="bg-bg rounded-lg overflow-hidden">
              <button onClick={() => setOpen(isOpen ? '' : g.vid)} className="w-full flex items-center gap-2 p-2.5 text-left">
                <span className="text-base">{g.hasComplete ? '✅' : '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold truncate">
                    {isNoVid ? '（訪問者ID無しの古いデータ）' : g.vid}
                  </div>
                  <div className="text-[10px] text-muted">
                    {g.count}件 {g.resultType && `・ ${g.resultType}`} ・ {g.lastTs ? new Date(g.lastTs).toLocaleString('ja-JP', { hour12: false }) : ''}
                  </div>
                </div>
                <span className="text-muted text-[11px] flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="px-2.5 pb-2.5">
                  {!isNoVid && (
                    <button
                      onClick={() => del({ visitorId: g.vid }, `この訪問者の全データ(${g.count}件)`)}
                      disabled={!!busy}
                      className="w-full mb-2 py-2 bg-red-100 text-red-700 rounded-lg text-[12px] font-bold disabled:opacity-50"
                    >この訪問者の全データを削除（{g.count}件）</button>
                  )}
                  <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
                    {g.events.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 bg-card rounded p-1.5 text-[10px]">
                        <span className="px-1.5 py-px rounded bg-bg border border-border font-bold flex-shrink-0">{EVENT_LABEL[e.event] || e.event}</span>
                        <span className="flex-1 min-w-0 truncate text-sub">
                          {[e.resultType, e.qid, e.optionLabel].filter(Boolean).join(' ・ ')}
                          <span className="text-muted"> {e.ts ? new Date(e.ts).toLocaleString('ja-JP', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </span>
                        <button onClick={() => del({ id: e.id }, 'この1件')} disabled={!!busy} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-bold flex-shrink-0">削除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
