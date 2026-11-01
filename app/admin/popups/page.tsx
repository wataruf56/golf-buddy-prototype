'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmDialog } from '@/components/ConfirmDialog';
import { PopupStats, fmtAt, Mini, type PopupRow } from '@/components/admin/PopupStats';
import { POPUP_CATALOG } from '@/lib/popupCatalog';

// 管理画面：🪟 ポップアップ（2026-11-01・本人要望「ポップアップに関するものを一括で管理したい」）
//   ① 一覧・オン／オフ … 全ポップアップの「出している／止めている」、直近24時間に出た回数、切り替え（_config/popups・lib/popupSwitch）
//   ② 反応（統計）      … ポップアップごとの成果率・何もしなかった人・押したものの内訳 → 誰が・いつ（以前は計測ハブにあった）
//   ③ 記録をさがす      … ポップアップ・操作・名前で絞って、1件ずつ（/api/admin/popups/events）
// 止められないもの（完了の確認・レビューなど、止めると業務が止まるもの）は lib/popupCatalog の lock に理由を書いてある。
export default function AdminPopupsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type Tab = 'list' | 'stats' | 'search';
type EvRow = {
  ts: number; userId: string; user: { name: string; gender?: string; age?: number };
  popup: string; popupName: string; emoji: string; action: string; actionLabel: string; goal: boolean; page: string; extra: Record<string, unknown> | null;
};

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<Tab>('list');
  const [days, setDays] = useState(30);
  const [withTest, setWithTest] = useState(false);
  const [popups, setPopups] = useState<PopupRow[] | null>(null);
  const [totals, setTotals] = useState<{ events: number; shows: number; users: number } | null>(null);
  const [off, setOff] = useState<Record<string, { at: number }>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // 記録をさがす
  const [fPopup, setFPopup] = useState('');
  const [fAction, setFAction] = useState('');
  const [fQ, setFQ] = useState('');
  const [found, setFound] = useState<{ total: number; rows: EvRow[] } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = search?.get('token') || (typeof window !== 'undefined' ? localStorage.getItem('gb_admin_token') || '' : '');
    if (t) setToken(t);
    const tb = search?.get('tab');
    if (tb === 'stats' || tb === 'search' || tb === 'list') setTab(tb);
  }, [search]);

  const q = token ? `token=${encodeURIComponent(token)}` : '';
  useEffect(() => {
    if (!token) return;
    setErr(''); setPopups(null);
    fetch(`/api/admin/popups?${q}&days=${days}${withTest ? '&test=1' : ''}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); setPopups(j.popups || []); setTotals(j.totals || null); })
      .catch((e) => setErr(String(e)));
  }, [token, days, withTest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin/popups/switch?${q}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => setOff(j.off || {})).catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(p: PopupRow, on: boolean) {
    if (busy) return;
    const ok = await confirmDialog(on
      ? { message: `「${p.name}」をオンにします。\n条件に合う人に、また出るようになります。` , confirmText: 'オンにする' }
      : { message: `「${p.name}」を止めます。\n次にアプリを開いた人から出なくなります（開いたままの人には、開き直すまで出ることがあります）。\n記録と設定はそのまま残り、オンに戻せばまた出ます。`, danger: true, confirmText: '止める' });
    if (!ok) return;
    setBusy(p.id);
    try {
      const r = await fetch(`/api/admin/popups/switch?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, on }), cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || `${r.status}`);
      setOff(j.off || {});
    } catch (e) { setErr(`切り替えられませんでした：${(e as Error).message}`); }
    setBusy('');
  }

  async function runSearch(popup = fPopup, action = fAction, qq = fQ) {
    if (!token) return;
    setSearching(true);
    const p = new URLSearchParams({ token, days: String(days) });
    if (popup) p.set('popup', popup);
    if (action) p.set('action', action);
    if (qq.trim()) p.set('q', qq.trim());
    if (withTest) p.set('test', '1');
    try {
      const j = await (await fetch(`/api/admin/popups/events?${p.toString()}`, { cache: 'no-store' })).json();
      if (j.error) setErr(j.error);
      setFound({ total: j.total || 0, rows: j.rows || [] });
    } catch (e) { setErr(String(e)); }
    setSearching(false);
  }
  useEffect(() => { if (tab === 'search' && token && !found) runSearch(); }, [tab, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'search' && found) runSearch(); }, [days, withTest]); // eslint-disable-line react-hooks/exhaustive-deps

  const goSearch = (popup: string, action = '', qq = '') => {
    setFPopup(popup); setFAction(action); setFQ(qq); setTab('search'); runSearch(popup, action, qq);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const goStats = (id: string) => {
    setTab('stats'); setOpenId(id);
    setTimeout(() => document.getElementById(`stat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const rows = popups || [];
  const controllable = rows.filter((p) => !p.lock && POPUP_CATALOG.some((c) => c.id === p.id));
  const locked = rows.filter((p) => !!p.lock);
  const others = rows.filter((p) => !p.lock && !POPUP_CATALOG.some((c) => c.id === p.id));
  const offCount = controllable.filter((p) => off[p.id]).length;
  const shows24 = rows.reduce((n, p) => n + (p.shows24h || 0), 0);
  const actionsFor = POPUP_CATALOG.find((c) => c.id === fPopup)?.actions || {};
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 pb-24">
      <Link href={`/admin${qs}`} className="text-sm text-blue font-bold">← 管理トップ</Link>
      <div className="flex items-end justify-between flex-wrap gap-2 mt-2">
        <div>
          <h1 className="text-2xl font-black">🪟 ポップアップ</h1>
          <div className="text-[11.5px] text-sub mt-0.5">アプリで自動で出るポップアップを、ここでまとめて止める・見る・さがす</div>
        </div>
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

      {/* いまの状態（ひと目で） */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <Mini label="出している" value={`${controllable.length - offCount + locked.length}種類`} sub={`うち止められないもの ${locked.length}`} good />
        <Mini label="止めている" value={`${offCount}種類`} sub={offCount ? controllable.filter((p) => off[p.id]).map((p) => p.name).join('・') : 'なし'} warn={offCount > 0} />
        <Mini label="直近24時間に出た" value={`${shows24}回`} sub="全ポップアップの合計" />
        <Mini label={`過去${days}日の記録`} value={totals ? `${totals.events.toLocaleString()}件` : '—'} sub={totals ? `出した ${totals.shows.toLocaleString()}回・${totals.users}人` : ''} />
      </div>

      {/* タブ */}
      <div className="flex gap-1 bg-card rounded-full p-1 shadow-card mt-4 sticky top-2 z-10">
        {([['list', '🔀 一覧・オン／オフ'], ['stats', '📊 反応（統計）'], ['search', '🔎 記録をさがす']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={'flex-1 whitespace-nowrap py-2 px-2 rounded-full text-[12px] font-black ' + (tab === k ? 'bg-green text-white' : 'text-sub')}>{l}</button>
        ))}
      </div>

      {err && <div className="text-[12px] text-red-600 mt-2">{err}</div>}
      {!popups && <div className="text-[12px] text-muted mt-4">読み込み中…</div>}

      {/* ① 一覧・オン／オフ */}
      {popups && tab === 'list' && (
        <div className="mt-3">
          <div className="text-[13px] font-black mb-1.5">止められるもの <span className="text-[11px] text-muted font-bold">{controllable.length}種類</span></div>
          <div className="flex flex-col gap-2">
            {controllable.sort((a, b) => b.shows24h - a.shows24h || b.shownUsers - a.shownUsers).map((p) => (
              <PopupCard key={p.id} p={p} isOff={!!off[p.id]} offAt={off[p.id]?.at} days={days} busy={busy === p.id} qs={qs}
                onToggle={(on) => toggle(p, on)} onStats={() => goStats(p.id)} onSearch={() => goSearch(p.id)} />
            ))}
          </div>
          <div className="text-[13px] font-black mt-5 mb-1">止められないもの <span className="text-[11px] text-muted font-bold">{locked.length}種類・止めると業務が止まるため、ここでは切り替えない</span></div>
          <div className="flex flex-col gap-2">
            {locked.map((p) => (
              <PopupCard key={p.id} p={p} isOff={false} days={days} busy={false} qs={qs}
                onStats={() => goStats(p.id)} onSearch={() => goSearch(p.id)} />
            ))}
          </div>
          {others.length > 0 && (
            <>
              <div className="text-[13px] font-black mt-5 mb-1">記録だけあるもの <span className="text-[11px] text-muted font-bold">一覧（lib/popupCatalog）に無い名前</span></div>
              <div className="flex flex-col gap-2">
                {others.map((p) => <PopupCard key={p.id} p={p} isOff={false} days={days} busy={false} qs={qs} onStats={() => goStats(p.id)} onSearch={() => goSearch(p.id)} />)}
              </div>
            </>
          )}
          <div className="text-[11px] text-sub mt-4 leading-relaxed">
            ・止めると、次にアプリを開いた人から出なくなります（最大30秒ほどで全員に反映）。記録・設定・対象の条件はそのまま残ります。<br />
            ・ポップアップは同時に1つだけ出ます。1つ止めると、その次に優先度の高いものが出やすくなります。<br />
            ・中身（文面・対象・予約）を変えるものは、各カードの「設定 ›」から専用の画面へ。
          </div>
        </div>
      )}

      {/* ② 反応（統計） */}
      {popups && tab === 'stats' && (
        <div className="mt-3">
          <div className="text-[11px] text-sub mb-2 leading-relaxed">過去{days}日。成果率＝目的の操作（🎯）をした人の割合。「何もしなかった」＝出たが、閉じる・選ぶ操作の記録がない人（アプリを閉じた・ページを移った）。記録は 2026-10-12 から。</div>
          <PopupStats token={token} days={days} withTest={withTest} popups={rows} openId={openId} onOpen={setOpenId} onSearch={(id) => goSearch(id)} />
        </div>
      )}

      {/* ③ 記録をさがす */}
      {tab === 'search' && (
        <div className="mt-3">
          <form className="bg-card rounded-card shadow-card border-2 border-border p-3 flex flex-wrap gap-2 items-end"
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
            <label className="flex flex-col text-[11px] font-bold text-sub gap-0.5">ポップアップ
              <select id="f-popup" value={fPopup} onChange={(e) => { setFPopup(e.target.value); setFAction(''); }} className="px-2 py-1.5 rounded-lg border-2 border-border bg-bg text-[12.5px] text-text">
                <option value="">すべて</option>
                {POPUP_CATALOG.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-[11px] font-bold text-sub gap-0.5">したこと
              <select id="f-action" value={fAction} onChange={(e) => setFAction(e.target.value)} className="px-2 py-1.5 rounded-lg border-2 border-border bg-bg text-[12.5px] text-text">
                <option value="">すべて</option>
                <option value="show">出た</option>
                {Object.entries(actionsFor).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-[11px] font-bold text-sub gap-0.5 flex-1 min-w-[160px]">名前・ユーザーID
              <input id="f-q" value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="例：mayumi" className="px-2.5 py-1.5 rounded-lg border-2 border-border bg-bg text-[12.5px] text-text" />
            </label>
            <button type="submit" className="px-4 py-2 rounded-full bg-green text-white text-[12.5px] font-black" disabled={searching}>{searching ? 'さがし中…' : 'さがす'}</button>
            {(fPopup || fAction || fQ) && <button type="button" onClick={() => goSearch('', '', '')} className="px-3 py-2 rounded-full text-[12px] font-bold text-sub">条件をクリア</button>}
          </form>
          {found && (
            <div className="mt-2">
              <div className="text-[11.5px] text-sub mb-1.5">過去{days}日で <b className="text-text">{found.total.toLocaleString()}件</b>{found.total > found.rows.length ? `（新しい順に${found.rows.length}件を表示）` : '（新しい順）'}。名前を押すと、その人の記録だけにします。</div>
              {found.rows.length === 0 ? <div className="text-[12px] text-muted py-6 text-center">見つかりませんでした</div> : (
                <div className="bg-card rounded-card shadow-card border-2 border-border overflow-x-auto">
                  <table className="w-full text-[12px] min-w-[560px]">
                    <thead><tr className="text-sub text-left bg-bg"><th className="py-1.5 px-2 font-bold">日時</th><th className="py-1.5 px-2 font-bold">誰が</th><th className="py-1.5 px-2 font-bold">ポップアップ</th><th className="py-1.5 px-2 font-bold">したこと</th><th className="py-1.5 px-2 font-bold">どの画面で</th></tr></thead>
                    <tbody>
                      {found.rows.map((r, i) => (
                        <tr key={`${r.userId}-${r.ts}-${i}`} className="border-t border-hair align-top">
                          <td className="py-1.5 px-2 whitespace-nowrap font-num">{new Date(r.ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="py-1.5 px-2">
                            <button type="button" onClick={() => goSearch(fPopup, fAction, r.userId)} className="font-bold text-blue text-left">{r.user?.name || r.userId}</button>
                            <span className="text-[10px] text-muted ml-1">{r.user?.gender === 'female' ? '女性' : r.user?.gender === 'male' ? '男性' : ''}{r.user?.age ? `・${r.user.age}歳` : ''}</span>
                          </td>
                          <td className="py-1.5 px-2"><button type="button" onClick={() => goSearch(r.popup, fAction, fQ)} className="text-left">{r.emoji} {r.popupName}</button></td>
                          <td className={'py-1.5 px-2 font-bold ' + (r.action === 'show' ? 'text-sub' : r.goal ? 'text-green' : '')}>{r.goal ? '🎯 ' : ''}{r.actionLabel}</td>
                          <td className="py-1.5 px-2 text-sub break-all">{r.page || '—'}{r.extra ? <span className="block text-[10px] text-muted">{Object.entries(r.extra).map(([k, v]) => `${k}:${v}`).join(' ')}</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PopupCard({ p, isOff, offAt, days, busy, qs, onToggle, onStats, onSearch }: {
  p: PopupRow; isOff: boolean; offAt?: number; days: number; busy: boolean; qs: string;
  onToggle?: (on: boolean) => void; onStats: () => void; onSearch: () => void;
}) {
  return (
    <div className={'rounded-card shadow-card border-2 p-3.5 ' + (isOff ? 'bg-bg border-dashed border-muted' : 'bg-card border-border')}>
      <div className="flex items-start gap-2.5">
        <span className={'text-[22px] leading-none mt-0.5 ' + (isOff ? 'grayscale opacity-60' : '')}>{p.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-black">{p.name}</span>
            {p.lock ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-bg text-sub border border-border">🔒 止められない</span>
              : isOff ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-300">止めている</span>
              : <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-light text-green border border-green">出している</span>}
            {p.forced && <span className="text-[10px] font-bold text-muted">閉じるボタンなし</span>}
          </div>
          <div className="text-[11px] text-sub mt-0.5">{p.who || '—'}</div>
          {p.lock && <div className="text-[10.5px] text-muted mt-0.5">{p.lock}</div>}
          {isOff && offAt ? <div className="text-[10.5px] text-red-600 font-bold mt-0.5">{fmtAt(offAt)} から止めている</div> : null}
        </div>
        {onToggle && (
          <button type="button" role="switch" aria-checked={!isOff} aria-label={`${p.name}を${isOff ? 'オン' : 'オフ'}にする`} disabled={busy}
            onClick={() => onToggle(isOff)}
            className={'relative w-[52px] h-[30px] rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ' + (isOff ? 'bg-border/40' : 'bg-green')}>
            <span className={'absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all ' + (isOff ? 'left-[3px]' : 'left-[25px]')} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px]">
        <span>直近24時間 <b>{p.shows24h}回</b></span>
        <span className="text-sub">最後に出た {fmtAt(p.lastShowAt)}</span>
        <span className="text-sub">過去{days}日 {p.shownUsers}人に出した</span>
        <span className="text-sub">成果率 <b className="text-green">{p.goalRate == null ? '—' : `${p.goalRate}%`}</b></span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button type="button" onClick={onStats} className="px-2.5 py-1 rounded-full text-[11px] font-black border-[1.5px] border-border bg-card">📊 反応を見る</button>
        <button type="button" onClick={onSearch} className="px-2.5 py-1 rounded-full text-[11px] font-black border-[1.5px] border-border bg-card">🔎 記録をさがす</button>
        {p.settings && <Link href={`${p.settings.href}${qs}`} className="px-2.5 py-1 rounded-full text-[11px] font-black border-[1.5px] border-orange text-orange bg-card">⚙️ 設定：{p.settings.label} ›</Link>}
      </div>
    </div>
  );
}
