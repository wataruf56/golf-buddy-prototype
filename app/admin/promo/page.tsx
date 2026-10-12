'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';
import { RoundPromoCard, PROMO_DEFAULTS, type PromoTexts, type PromoRoundView } from '@/components/RoundPromoCard';
import { hostSeat } from '@/lib/hostCount';

// 管理画面：募集のイチオシ（運営からのおすすめポップアップ）（2026-10-12）
//   ① 募集を選ぶ（募集中・開催前）② 文言（見出し・ひとこと・ボタンなど）と時間 ③ プレビュー（会員に出るものと同じ部品）→ 作成
//   一覧：状態／表示した人・押した人・その後に申請した人／文言とプレビューの編集・時間の変更・停止・再開・削除
// 会員側：1人1回だけ。ほかのポップアップが出ていれば、閉じて1時間後（components/RoundPromoPopup・lib/popupSlot）。
export default function AdminPromoPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type RoundRow = { id: string; title?: string; date?: string; startTime?: string; area?: string; status?: string; applicantIds?: string[]; maxSpots?: number; price?: string; availDate?: string; courseName?: string; levelCondition?: string; hostId?: string; externalMale?: number; externalFemale?: number; externalCount?: number; hostNotCounted?: boolean; hostJoined?: boolean };
type Promo = {
  id: string; roundId: string; showAt: number; until?: number; approved: boolean; headline?: string; texts?: PromoTexts; createdAt: number;
  round: (PromoRoundView & { id: string; status: string }) | null;
  stats: { seen: number; go: number; joined: number };
};
const HEADLINES = ['この日の募集があります！', 'まだ間に合います！', 'あと少しで満員！', '初心者さん大歓迎！', '今週末、空いてませんか？'];
const jstLocal = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 16);
const fromLocal = (s: string) => (s ? Date.parse(`${s}:00+09:00`) : 0);
const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const md = (d?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${Number(m[2])}/${Number(m[3])}` : (d || '日程未定'); };
const textsOf = (p: Promo): PromoTexts => ({ ...(p.texts || {}), ...(p.headline && !p.texts?.headline ? { headline: p.headline } : {}) });

function statusOf(p: Promo): { label: string; cls: string } {
  const now = Date.now();
  const today = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!p.round || p.round.status !== 'open' || (p.round.date && p.round.date < today) || (p.until && now >= p.until)) return { label: '⚪ 終了', cls: 'bg-bg text-muted border-border' };
  if (!p.approved) return { label: '⏸ 停止中', cls: 'bg-bg text-sub border-border' };
  if (now < p.showAt) return { label: '⏰ 予約中', cls: 'bg-blue-light text-blue border-blue' };
  return { label: '🟢 表示中', cls: 'bg-green-light text-green border-green' };
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [users, setUsers] = useState<Record<string, { displayName: string; avatar: string }>>({});
  const [promos, setPromos] = useState<Promo[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<RoundRow | null>(null);
  const [texts, setTexts] = useState<PromoTexts>({});
  const [showAt, setShowAt] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<PromoTexts>({});

  useEffect(() => {
    const t = search?.get('token') || (typeof window !== 'undefined' ? localStorage.getItem('gb_admin_token') || '' : '');
    if (t) setToken(t);
    const n = new Date(); n.setMinutes(0, 0, 0); n.setHours(n.getHours() + 1);
    setShowAt(jstLocal(n.getTime()));
  }, [search]);

  async function load(t = token) {
    if (!t) return;
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/rounds?token=${encodeURIComponent(t)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/admin/promo-popup?token=${encodeURIComponent(t)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    ]);
    setRounds((r1.items || []) as RoundRow[]);
    setUsers(r1.users || {});
    setPromos((r2.promos || []) as Promo[]);
  }
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const candidates = useMemo(() => rounds
    .filter((r) => r.status === 'open' && !r.availDate && (!r.date || r.date >= today))
    .filter((r) => !q || `${r.title} ${r.area} ${r.courseName} ${r.date}`.includes(q))
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))), [rounds, q, today]);

  const viewOf = (r: RoundRow): PromoRoundView => ({
    title: r.title || r.courseName || 'ラウンド', date: r.date || '', startTime: r.startTime || '', area: r.area || '', courseName: r.courseName || '',
    price: r.price || '', levelCondition: r.levelCondition || '', maxSpots: Number(r.maxSpots || 0),
    joined: hostSeat(r) + (r.applicantIds || []).length + Number(r.externalMale || 0) + Number(r.externalFemale || 0) + Number(r.externalCount || 0),
    host: r.hostId && users[r.hostId] ? { id: r.hostId, ...users[r.hostId] } : null,
  });

  function pick(r: RoundRow) {
    setSel(r);
    if (r.date) setUntil(`${r.date}T${/^\d{1,2}:\d{2}/.test(r.startTime || '') ? (r.startTime as string).padStart(5, '0') : '07:00'}`);
    else setUntil('');
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/promo-popup?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
  }

  async function create(approved: boolean) {
    if (!sel) return;
    const s = fromLocal(showAt); const u = fromLocal(until);
    if (!s) { await alertDialog('出す時間を入れてください'); return; }
    if (u && u <= s) { await alertDialog('やめる時間は、出す時間より後にしてください'); return; }
    if (!(await confirmDialog(`「${sel.title}」（${md(sel.date)}）を${approved ? '有効にして' : '停止中のまま'}作成します。\n出す時間：${fmt(s)}${u ? `\nやめる時間：${fmt(u)}` : ''}`))) return;
    setBusy(true);
    try {
      await post({ create: true, roundId: sel.id, showAt: s, ...(u ? { until: u } : {}), approved, texts });
      setSel(null); setTexts({});
      await load();
    } catch { await alertDialog('作成に失敗しました'); }
    finally { setBusy(false); }
  }

  async function saveTexts(p: Promo) {
    setBusy(true);
    try { await post({ id: p.id, texts: editTexts }); setEditing(null); await load(); }
    catch { await alertDialog('保存に失敗しました'); }
    finally { setBusy(false); }
  }
  async function toggle(p: Promo) {
    setBusy(true);
    try { await post({ id: p.id, approved: !p.approved }); await load(); } finally { setBusy(false); }
  }
  async function retime(p: Promo, field: 'showAt' | 'until', v: string) {
    const ms = fromLocal(v); if (!ms) return;
    setBusy(true);
    try { await post({ id: p.id, [field]: ms }); await load(); } finally { setBusy(false); }
  }
  async function remove(p: Promo) {
    if (!(await confirmDialog({ message: `「${p.round?.title || p.roundId}」のイチオシを削除しますか？（まだ見ていない人にも出なくなります）`, danger: true, confirmText: '削除する' }))) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/promo-popup?token=${encodeURIComponent(token)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }), cache: 'no-store' });
      await load();
    } finally { setBusy(false); }
  }

  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return (
    <div className="max-w-5xl mx-auto px-4 py-5">
      <Link href={`/admin${qs}`} className="text-sm text-blue font-bold">← 管理トップ</Link>
      <h1 className="text-2xl font-black mt-2">🔥 募集のイチオシ（おすすめポップアップ）</h1>
      <p className="text-[12px] text-sub mt-1 leading-relaxed">
        選んだ募集を、アプリを開いた会員に<b>1人1回だけ</b>ポップアップですすめます。ほかのポップアップが出ている人には、それが閉じて1時間たってから出ます。
        主催者・参加者・申請中の人・別の年代の人には出ません。募集が締切になる・開催日を過ぎる・やめる時間になると、自動で出なくなります。
        <Link href={`/admin/insights${qs}`} className="text-blue font-bold ml-1">📊 計測ハブで反応を見る</Link>
      </p>

      {/* 作る */}
      <section className="mt-5 bg-card rounded-card shadow-card border-2 border-border p-4">
        <div className="text-[15px] font-black mb-2">① 募集を選ぶ</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル・エリア・日付でさがす"
          className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2 bg-bg outline-none mb-2" />
        <div className="max-h-[240px] overflow-y-auto flex flex-col gap-1.5">
          {candidates.length === 0 && <div className="text-[12px] text-muted">募集中の募集がありません</div>}
          {candidates.map((r) => {
            const v = viewOf(r);
            const on = sel?.id === r.id;
            const already = promos.some((p) => p.roundId === r.id && statusOf(p).label !== '⚪ 終了');
            return (
              <button key={r.id} type="button" onClick={() => pick(r)}
                className={'text-left flex items-center gap-3 rounded-xl border-2 px-3 py-2 ' + (on ? 'border-green bg-green-light' : 'border-border bg-bg')}>
                <span className="w-12 text-center text-[13px] font-black text-green flex-none">{md(r.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold truncate">{v.title}</span>
                  <span className="block text-[11px] text-muted truncate">{r.area || ''} ・ {v.joined}/{r.maxSpots || '?'}人{r.price ? ` ・ ${r.price}` : ''}{v.host ? ` ・ 主催 ${v.host.displayName}` : ''}</span>
                </span>
                {already && <span className="text-[10px] font-bold text-orange flex-none">イチオシ中</span>}
              </button>
            );
          })}
        </div>

        {sel && (
          <div className="mt-4 grid md:grid-cols-2 gap-5">
            <div>
              <div className="text-[15px] font-black mb-2">② 文言と時間</div>
              <TextEditor value={texts} onChange={setTexts} />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="block text-[11px] font-bold text-sub mb-1">出す時間（この時間以降に開いた人）</label>
                  <input type="datetime-local" value={showAt} onChange={(e) => setShowAt(e.target.value)} className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-2 py-2 bg-bg outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-sub mb-1">やめる時間（空なら開催日まで）</label>
                  <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-2 py-2 bg-bg outline-none" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" disabled={busy} onClick={() => create(true)} className="flex-1 py-3 bg-orange text-white rounded-xl font-black text-sm disabled:opacity-50">この内容で有効にする</button>
                <button type="button" disabled={busy} onClick={() => create(false)} className="px-4 py-3 bg-bg border-[1.5px] border-border rounded-xl font-bold text-sm disabled:opacity-50">停止中で作成</button>
              </div>
            </div>
            <div>
              <div className="text-[15px] font-black mb-2">③ プレビュー（会員にはこう見えます）</div>
              <PreviewFrame><RoundPromoCard r={viewOf(sel)} texts={texts} /></PreviewFrame>
            </div>
          </div>
        )}
      </section>

      {/* 一覧 */}
      <section className="mt-6">
        <div className="text-[15px] font-black mb-2">これまでのイチオシ</div>
        {promos.length === 0 && <div className="text-[12px] text-muted">まだありません</div>}
        <div className="flex flex-col gap-2.5">
          {promos.map((p) => {
            const st = statusOf(p);
            const isEdit = editing === p.id;
            return (
              <div key={p.id} className="bg-card rounded-card shadow-card border-2 border-border p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={'text-[11px] font-black px-2 py-0.5 rounded-full border ' + st.cls}>{st.label}</span>
                  <span className="text-[14px] font-black truncate flex-1">{p.round ? `${md(p.round.date)} ${p.round.title}` : `（削除された募集 ${p.roundId}）`}</span>
                  {p.round && <a href={`https://app.goltomo.com/round/${p.round.id}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue font-bold flex-none">募集を見る ↗</a>}
                </div>
                <div className="text-[12px] text-sub mt-1">見出し：{textsOf(p).headline || PROMO_DEFAULTS.headline}{p.round ? ` ・ 参加 ${p.round.joined}/${p.round.maxSpots || '?'}人` : ''}</div>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  <Stat label="表示した人" value={p.stats.seen} />
                  <Stat label="「参加してみる」" value={p.stats.go} sub={p.stats.seen ? `${Math.round((p.stats.go / p.stats.seen) * 100)}%` : ''} />
                  <Stat label="その後に申請・参加" value={p.stats.joined} sub={p.stats.seen ? `${Math.round((p.stats.joined / p.stats.seen) * 100)}%` : ''} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <label className="text-[11px] font-bold text-sub">出す時間
                    <input type="datetime-local" defaultValue={p.showAt ? jstLocal(p.showAt) : ''} onBlur={(e) => e.target.value !== jstLocal(p.showAt) && retime(p, 'showAt', e.target.value)}
                      className="mt-0.5 w-full text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1.5 bg-bg outline-none" />
                  </label>
                  <label className="text-[11px] font-bold text-sub">やめる時間
                    <input type="datetime-local" defaultValue={p.until ? jstLocal(p.until) : ''} onBlur={(e) => e.target.value && e.target.value !== (p.until ? jstLocal(p.until) : '') && retime(p, 'until', e.target.value)}
                      className="mt-0.5 w-full text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1.5 bg-bg outline-none" />
                  </label>
                </div>
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <button type="button" onClick={() => { if (isEdit) { setEditing(null); } else { setEditing(p.id); setEditTexts(textsOf(p)); } }}
                    className="px-3 py-1.5 rounded-lg border-[1.5px] border-green text-green bg-green-light text-[12px] font-bold">{isEdit ? '▲ 閉じる' : '✏️ 文言とプレビュー'}</button>
                  <button type="button" disabled={busy} onClick={() => toggle(p)} className="px-3 py-1.5 rounded-lg border-[1.5px] border-border bg-bg text-[12px] font-bold disabled:opacity-50">{p.approved ? '⏸ 停止する' : '▶ 有効にする'}</button>
                  <button type="button" disabled={busy} onClick={() => remove(p)} className="px-3 py-1.5 rounded-lg border-[1.5px] border-red-300 text-red-600 bg-card text-[12px] font-bold disabled:opacity-50">削除</button>
                  <span className="ml-auto text-[10px] text-muted self-center">作成 {fmt(p.createdAt)}</span>
                </div>
                {isEdit && p.round && (
                  <div className="mt-3 grid md:grid-cols-2 gap-5 border-t-2 border-hair pt-3">
                    <div>
                      <TextEditor value={editTexts} onChange={setEditTexts} />
                      <div className="text-[10.5px] text-muted mt-2">保存すると、まだ見ていない人には新しい文言で出ます（もう見た人には出ません）。</div>
                      <button type="button" disabled={busy} onClick={() => saveTexts(p)} className="mt-2 w-full py-2.5 bg-green text-white rounded-xl font-black text-sm disabled:opacity-50">この文言で保存する</button>
                    </div>
                    <div>
                      <div className="text-[12px] font-black mb-1.5">プレビュー</div>
                      <PreviewFrame><RoundPromoCard r={p.round} texts={editTexts} /></PreviewFrame>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// 文言の入力欄。空欄は既定の文言（薄く表示）になる
function TextEditor({ value, onChange }: { value: PromoTexts; onChange: (v: PromoTexts) => void }) {
  const set = (k: keyof PromoTexts, v: string) => onChange({ ...value, [k]: v });
  const field = (k: keyof PromoTexts, label: string, max: number, area?: boolean) => (
    <div className="mb-2">
      <label className="block text-[11px] font-bold text-sub mb-0.5">{label}</label>
      {area ? (
        <textarea value={value[k] || ''} onChange={(e) => set(k, e.target.value)} maxLength={max} rows={2} placeholder={PROMO_DEFAULTS[k] || '（なし）'}
          className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2 bg-bg outline-none resize-y" />
      ) : (
        <input value={value[k] || ''} onChange={(e) => set(k, e.target.value)} maxLength={max} placeholder={PROMO_DEFAULTS[k] || '（なし）'}
          className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2 bg-bg outline-none" />
      )}
    </div>
  );
  return (
    <div>
      {field('headline', '見出し（いちばん大きい文字）', 60)}
      <div className="flex flex-wrap gap-1.5 -mt-1 mb-2">
        {HEADLINES.map((h) => <button key={h} type="button" onClick={() => set('headline', h)} className="text-[11px] font-bold px-2 py-1 rounded-full border border-border bg-bg">{h}</button>)}
      </div>
      {field('message', 'ひとこと（見出しの下・任意）', 120, true)}
      {field('badge', 'リボン上の小さい文字', 60)}
      {field('ctaLabel', 'オレンジのボタン', 60)}
      {field('closeLabel', '下の小さいボタン', 60)}
      {field('sideNote', '主催者の横の小さい文字', 60)}
      <button type="button" onClick={() => onChange({})} className="text-[11px] font-bold text-sub underline">すべて既定の文言に戻す</button>
    </div>
  );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 flex justify-center items-center min-h-[520px]" style={{ background: 'rgba(0,0,0,0.6)' }}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-bg border border-border px-2.5 py-2 text-center">
      <div className="text-[18px] font-black leading-none">{value}<span className="text-[11px] font-bold text-muted ml-0.5">人</span></div>
      <div className="text-[10px] text-sub font-bold mt-1">{label}{sub ? `（${sub}）` : ''}</div>
    </div>
  );
}
