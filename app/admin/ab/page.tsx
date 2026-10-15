'use client';

import { useCallback, useEffect, useState } from 'react';
import { NumberInput } from '@/components/NumberInput';

// 広告のA/Bテスト。画像だけ違う広告を同じ予算・期間で出して、どれが押されるかを比べる。
// スマホから開いて、Ads Manager の数字を入れ、結果を見る想定。
//
// 数字の出どころ:
//   広告側（表示・クリック・費用・プロフィールへのアクセス）… Ads Manager から手で入れる
//   LP側（来訪〜登録）… 広告のリンク先の ?ref= で自動集計（lib/adTests.ts）

type Variant = {
  key: string; label: string; ref: string; imageUrl?: string;
  impressions?: number | null; clicks?: number | null; spend?: number | null; profileVisits?: number | null;
};
type Funnel = { visitors: number; starts: number; completes: number; ctas: number; registered: number };
type Test = {
  id: string; name: string; startDate: string; endDate: string; landing: string; note?: string;
  variants: Variant[]; funnels: Record<string, Funnel>; funnelError?: string;
};

// ---------------------------------------------------------------- 計算
const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP');
const pct = (n: number) => (n * 100).toFixed(2) + '%';
const int = (n: number) => Math.round(n).toLocaleString('ja-JP');

/** 2つの割合の差が偶然かどうか（両側p値）。数が足りなければ null。 */
function pValue(x1: number, n1: number, x2: number, n2: number): number | null {
  if (!n1 || !n2 || x1 + x2 === 0) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  // erfc の近似（Abramowitz–Stegun 7.1.26）
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return y * Math.exp(-(z * z) / 2);
}

type Verdict = { tone: 'win' | 'lean' | 'tie' | 'wait'; text: string };

/** 割合がいちばん高い案と2番目を比べて、ひとことで言う。 */
function judge(items: { label: string; x: number | null | undefined; n: number | null | undefined }[], what: string): Verdict {
  const ready = items.filter((i) => i.n && i.x != null) as { label: string; x: number; n: number }[];
  if (ready.length < 2) return { tone: 'wait', text: `${what}：数字が入ると判定します` };
  const sorted = ready.slice().sort((a, b) => b.x / b.n - a.x / a.n);
  const [a, b] = sorted;
  const p = pValue(a.x, a.n, b.x, b.n);
  if (p == null) return { tone: 'wait', text: `${what}：まだ判定できる数がありません` };
  if (p < 0.05) return { tone: 'win', text: `${what}：${a.label} の勝ち。差は偶然ではなさそうです` };
  if (p < 0.2) return { tone: 'lean', text: `${what}：${a.label} が優勢。まだ断言はできません` };
  return { tone: 'tie', text: `${what}：差は偶然の範囲です。もっと数が要ります` };
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function phase(t: Test): { label: string; color: string } {
  const d = todayJst();
  if (t.startDate && d < t.startDate) return { label: '準備中', color: '#6b7280' };
  if (t.endDate && d > t.endDate) return { label: '終了', color: '#15803d' };
  return { label: '配信中', color: '#2563eb' };
}
const linkOf = (t: Test, v: Variant) => `${t.landing}?ref=${v.ref}`;

// ---------------------------------------------------------------- 画面
export default function AdminAbPage() {
  const [token, setToken] = useState('');
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async (tk: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/ab?token=${encodeURIComponent(tk)}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error) setMsg(j.error); else setTests(j.tests || []);
    } catch (e) { setMsg(String(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/init', { cache: 'no-store' });
      const j = await r.json();
      setToken(j.token || '');
      if (j.token) await load(j.token); else setLoading(false);
    })();
  }, [load]);

  async function post(body: any, okMsg: string): Promise<boolean> {
    setMsg('');
    try {
      const r = await fetch(`/api/admin/ab?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.error) { setMsg(`⚠️ ${j.error}`); return false; }
      setMsg(okMsg); await load(token); return true;
    } catch (e) { setMsg(String(e)); return false; }
  }

  if (loading && !tests.length) return <main style={S.wrap}><p>読み込み中…</p></main>;

  return (
    <main style={S.wrap}>
      <style>{CSS}</style>
      <div style={S.head}>
        <h1 style={S.h1}>広告A/Bテスト</h1>
        <button style={{ ...S.btn, ...S.primary }} onClick={() => setShowNew(!showNew)}>
          {showNew ? '閉じる' : '＋ 新しいテスト'}
        </button>
      </div>
      <p style={S.lead}>
        画像だけ違う広告を、同じ予算・同じ期間で出して比べます。表示・クリック・費用は Ads Manager の数字を入れてください。
        LPに来てから登録までは、広告のリンク先のタグで自動で数えます。
      </p>
      {msg && <p style={S.msg}>{msg}</p>}
      {showNew && <NewTest onCreate={async (b) => { if (await post({ action: 'create', ...b }, '作りました')) setShowNew(false); }} />}
      {!tests.length && !showNew && <p style={S.small}>まだテストがありません。</p>}
      {tests.map((t) => (
        <TestCard key={t.id} t={t}
          onSave={(patch) => post({ action: 'save', id: t.id, ...patch }, '保存しました')}
          onDelete={() => post({ action: 'delete', id: t.id }, '削除しました')} />
      ))}
      <button style={{ ...S.btn, marginTop: 8 }} onClick={() => load(token)}>LPの数字を読み直す</button>
    </main>
  );
}

// ---------------------------------------------------------------- 1テスト
function TestCard({ t, onSave, onDelete }: {
  t: Test; onSave: (patch: any) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<Record<string, Variant>>(() => Object.fromEntries(t.variants.map((v) => [v.key, v])));
  const [start, setStart] = useState(t.startDate);
  const [end, setEnd] = useState(t.endDate);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => { setEdit(Object.fromEntries(t.variants.map((v) => [v.key, v]))); setStart(t.startDate); setEnd(t.endDate); }, [t]);

  const vs = t.variants.map((v) => ({ v, f: t.funnels?.[v.ref] || { visitors: 0, starts: 0, completes: 0, ctas: 0, registered: 0 } }));
  const ph = phase(t);

  const verdicts = [
    judge(vs.map(({ v }) => ({ label: v.label, x: v.clicks, n: v.impressions })), 'クリック率'),
    judge(vs.map(({ v }) => ({ label: v.label, x: v.profileVisits, n: v.impressions })), 'プロフィールへのアクセス率'),
    judge(vs.map(({ v, f }) => ({ label: v.label, x: f.registered, n: f.visitors })), 'LPに来た人の登録率'),
  ];

  // 行ごとに、いちばん良い案を太字にする（小さいほど良い指標は low）
  type Row = { name: string; get: (v: Variant, f: Funnel) => number | null; fmt: (n: number) => string; best?: 'high' | 'low'; group?: string };
  const rows: Row[] = [
    { group: '広告（Ads Manager）', name: '表示回数', get: (v) => v.impressions ?? null, fmt: int },
    { name: 'リンクのクリック', get: (v) => v.clicks ?? null, fmt: int },
    { name: 'クリック率', get: (v) => (v.impressions && v.clicks != null ? v.clicks / v.impressions : null), fmt: pct, best: 'high' },
    { name: '費用', get: (v) => v.spend ?? null, fmt: yen },
    { name: 'クリック単価', get: (v) => (v.spend && v.clicks ? v.spend / v.clicks : null), fmt: yen, best: 'low' },
    { name: 'プロフィールへのアクセス', get: (v) => v.profileVisits ?? null, fmt: int },
    { name: 'アクセス率', get: (v) => (v.impressions && v.profileVisits != null ? v.profileVisits / v.impressions : null), fmt: pct, best: 'high' },
    { group: 'LP（自動）', name: 'LPに来た人', get: (_, f) => f.visitors, fmt: int },
    { name: '診断を始めた', get: (_, f) => f.starts, fmt: int },
    { name: '診断を終えた', get: (_, f) => f.completes, fmt: int },
    { name: 'LINEへ進んだ', get: (_, f) => f.ctas, fmt: int },
    { name: '新規登録', get: (_, f) => f.registered, fmt: int, best: 'high' },
    { name: '登録率（LP来訪→登録）', get: (_, f) => (f.visitors ? f.registered / f.visitors : null), fmt: pct, best: 'high' },
    { name: '登録単価', get: (v, f) => (v.spend && f.registered ? v.spend / f.registered : null), fmt: yen, best: 'low' },
  ];

  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1600); }
    catch { window.prompt('コピーしてください', text); }
  }

  const setNum = (key: string, field: keyof Variant, n: number | null) =>
    setEdit((e) => ({ ...e, [key]: { ...e[key], [field]: n } }));

  return (
    <section style={S.card}>
      <div style={S.row}>
        <span style={{ ...S.badge, background: ph.color }}>{ph.label}</span>
        <strong style={{ fontSize: 16 }}>{t.name}</strong>
      </div>
      <p style={S.small}>{t.startDate || '開始日未定'} 〜 {t.endDate || '終了日未定'}</p>

      {/* 結論を先に */}
      <div style={S.verdicts}>
        {verdicts.map((vd, i) => (
          <p key={i} style={{ ...S.verdict, ...TONE[vd.tone] }}>{vd.text}</p>
        ))}
      </div>

      {/* 画像とリンク先 */}
      <div style={{ ...S.grid, gridTemplateColumns: `repeat(${Math.min(vs.length, 3)}, minmax(0, 1fr))` }}>
        {vs.map(({ v }) => (
          <div key={v.key} style={S.variant}>
            {v.imageUrl ? <img src={v.imageUrl} alt={v.label} style={S.img} /> : <div style={S.noimg}>画像なし</div>}
            <strong style={S.vlabel}>{v.label}</strong>
            <code style={S.link}>?ref={v.ref}</code>
            <button style={S.copy} onClick={() => copy(linkOf(t, v), v.key)}>
              {copied === v.key ? 'コピーしました' : 'リンク先をコピー'}
            </button>
          </div>
        ))}
      </div>

      {/* 比較表 */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr><th style={S.thName}></th>{vs.map(({ v }) => <th key={v.key} style={S.th}>{v.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vals = vs.map(({ v, f }) => r.get(v, f));
              const nums = vals.filter((x): x is number => x != null);
              const bestVal = r.best && nums.length > 1
                ? (r.best === 'high' ? Math.max(...nums) : Math.min(...nums)) : null;
              return [
                r.group ? <tr key={r.group}><td colSpan={vs.length + 1} style={S.group}>{r.group}</td></tr> : null,
                <tr key={r.name}>
                  <td style={S.tdName}>{r.name}</td>
                  {vals.map((x, i) => (
                    <td key={i} style={{ ...S.td, ...(bestVal != null && x === bestVal ? S.best : {}) }}>
                      {x == null ? '–' : r.fmt(x)}
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      {t.funnelError && <p style={S.err}>LPの数字を取れませんでした：{t.funnelError}</p>}

      {/* Ads Manager の数字を入れる */}
      <button style={{ ...S.btn, width: '100%', marginTop: 12 }} onClick={() => setOpen(!open)}>
        {open ? '入力を閉じる' : 'Ads Manager の数字を入れる'}
      </button>
      {open && (
        <div style={S.form}>
          <div style={S.dates}>
            <label style={S.lbl}>開始日<input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={S.input} /></label>
            <label style={S.lbl}>終了日<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={S.input} /></label>
          </div>
          {t.variants.map((v) => (
            <fieldset key={v.key} style={S.fs}>
              <legend style={S.legend}>{v.label}</legend>
              <div className="ab-fields">
                <label style={S.lbl}>表示回数<NumberInput id={`${t.id}-${v.key}-imp`} className="ab-num" value={edit[v.key]?.impressions} onChange={(n) => setNum(v.key, 'impressions', n)} min={0} /></label>
                <label style={S.lbl}>リンクのクリック<NumberInput id={`${t.id}-${v.key}-clk`} className="ab-num" value={edit[v.key]?.clicks} onChange={(n) => setNum(v.key, 'clicks', n)} min={0} /></label>
                <label style={S.lbl}>費用（円）<NumberInput id={`${t.id}-${v.key}-sp`} className="ab-num" value={edit[v.key]?.spend} onChange={(n) => setNum(v.key, 'spend', n)} min={0} /></label>
                <label style={S.lbl}>プロフィールへのアクセス<NumberInput id={`${t.id}-${v.key}-pv`} className="ab-num" value={edit[v.key]?.profileVisits} onChange={(n) => setNum(v.key, 'profileVisits', n)} min={0} /></label>
              </div>
            </fieldset>
          ))}
          <p style={S.small}>
            Ads Manager の「列」で「インプレッション」「リンクのクリック」「消化金額」「Instagramプロフィールへのアクセス」を表示すると、そのまま写せます。
          </p>
          <div style={S.actions}>
            <button style={{ ...S.btn, ...S.primary }}
              onClick={() => onSave({ startDate: start, endDate: end, variants: Object.values(edit) })}>保存</button>
            {!confirmDel
              ? <button style={{ ...S.btn, ...S.ghost }} onClick={() => setConfirmDel(true)}>このテストを削除</button>
              : <>
                  <span style={S.small}>本当に削除しますか？</span>
                  <button style={{ ...S.btn, ...S.danger }} onClick={() => onDelete()}>削除する</button>
                  <button style={{ ...S.btn, ...S.ghost }} onClick={() => setConfirmDel(false)}>やめる</button>
                </>}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 新規作成
function NewTest({ onCreate }: { onCreate: (b: any) => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayJst());
  const [end, setEnd] = useState('');
  const [vs, setVs] = useState([{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }]);
  const tag = (label: string) => 'ad_' + label.toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 30);
  const set = (i: number, k: 'label' | 'imageUrl', val: string) =>
    setVs((a) => a.map((v, j) => (j === i ? { ...v, [k]: val } : v)));
  const ready = name.trim() && vs.every((v) => tag(v.label) !== 'ad_') && new Set(vs.map((v) => tag(v.label))).size === vs.length;
  return (
    <section style={{ ...S.card, borderColor: '#86efac' }}>
      <label style={S.lbl}>テストの名前<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ゴルフ友達探し 画像比較" style={S.input} /></label>
      <div style={S.dates}>
        <label style={S.lbl}>開始日<input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={S.input} /></label>
        <label style={S.lbl}>終了日<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={S.input} /></label>
      </div>
      {vs.map((v, i) => (
        <fieldset key={i} style={S.fs}>
          <legend style={S.legend}>案 {i + 1}</legend>
          <label style={S.lbl}>名前（英数字。リンクのタグになります）<input value={v.label} onChange={(e) => set(i, 'label', e.target.value)} placeholder="例：X2" style={S.input} /></label>
          <label style={S.lbl}>画像のURL（任意）<input value={v.imageUrl} onChange={(e) => set(i, 'imageUrl', e.target.value)} placeholder="https://storage.googleapis.com/…" style={S.input} /></label>
          {tag(v.label) !== 'ad_' && <p style={S.small}>リンク先：…golmoti.html?ref=<b>{tag(v.label)}</b></p>}
        </fieldset>
      ))}
      <div style={S.actions}>
        <button style={S.btn} onClick={() => setVs((a) => [...a, { label: '', imageUrl: '' }])}>案を足す</button>
        <button style={{ ...S.btn, ...S.primary, opacity: ready ? 1 : 0.5 }} disabled={!ready}
          onClick={() => onCreate({ name, startDate: start, endDate: end, variants: vs.map((v) => ({ label: v.label, ref: tag(v.label), imageUrl: v.imageUrl })) })}>
          作る
        </button>
      </div>
      {!ready && <p style={S.small}>名前と、案ごとに別々の名前（英数字）を入れてください。</p>}
    </section>
  );
}

// ---------------------------------------------------------------- 見た目
const TONE: Record<Verdict['tone'], React.CSSProperties> = {
  win:  { background: '#dcfce7', borderColor: '#86efac', color: '#14532d' },
  lean: { background: '#fef9c3', borderColor: '#fde047', color: '#713f12' },
  tie:  { background: '#f3f4f6', borderColor: '#e5e7eb', color: '#374151' },
  wait: { background: '#fff', borderColor: '#e5e7eb', color: '#6b7280' },
};

const CSS = `
.ab-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ab-num{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;font-variant-numeric:tabular-nums}
`;

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 720, margin: '0 auto', padding: '16px 14px 64px', fontFamily: 'system-ui, sans-serif', color: '#111827' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '8px 0 8px' },
  h1: { fontSize: 20, fontWeight: 700, margin: 0 },
  lead: { fontSize: 13, color: '#4b5563', lineHeight: 1.7, margin: '0 0 14px' },
  msg: { background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: 8, fontSize: 14 },
  err: { color: '#dc2626', fontSize: 13, margin: '6px 0' },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 18, background: '#fff' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  badge: { color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  small: { fontSize: 12, color: '#6b7280', margin: '4px 0' },
  verdicts: { display: 'grid', gap: 6, margin: '10px 0 12px' },
  verdict: { margin: 0, border: '1px solid', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600, lineHeight: 1.5 },
  grid: { display: 'grid', gap: 10, marginBottom: 12 },
  variant: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  img: { width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 8, display: 'block', background: '#f3f4f6' },
  noimg: { width: '100%', aspectRatio: '4 / 5', borderRadius: 8, background: '#f3f4f6', color: '#9ca3af',
           display: 'grid', placeItems: 'center', fontSize: 12 },
  vlabel: { fontSize: 15 },
  link: { fontSize: 11, color: '#6b7280', wordBreak: 'break-all' },
  copy: { padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 12, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'right', padding: '8px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  thName: { background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  group: { padding: '8px 10px 4px', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#fff', letterSpacing: '.04em' },
  tdName: { padding: '6px 10px', color: '#374151', borderTop: '1px solid #f3f4f6' },
  td: { padding: '6px 10px', textAlign: 'right', borderTop: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  best: { fontWeight: 800, color: '#15803d' },
  form: { marginTop: 12, display: 'grid', gap: 10 },
  dates: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  fs: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px 10px', margin: 0, display: 'grid', gap: 8 },
  legend: { fontSize: 13, fontWeight: 700, padding: '0 4px' },
  lbl: { display: 'grid', gap: 4, fontSize: 12, color: '#374151' },
  input: { padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, width: '100%', boxSizing: 'border-box' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 14, cursor: 'pointer' },
  primary: { background: '#15803d', color: '#fff', borderColor: '#15803d', fontWeight: 700 },
  ghost: { background: '#fff', color: '#6b7280' },
  danger: { background: '#dc2626', color: '#fff', borderColor: '#dc2626', fontWeight: 700 },
};
