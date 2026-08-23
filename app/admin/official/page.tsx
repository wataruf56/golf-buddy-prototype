'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 運営が代理で立てる募集（公式スレッド）の管理。
//
// 同時に走らせるのは1本まで。ここが「いま何が動いているか」の唯一の場所になる。
// 2本目を作ろうとすると API が 409 で断るので、この画面でも先に伝えておく。
type Thread = {
  id: string; title: string; createdAt: number;
  official: { pattern: 'women' | 'meetup'; stage: string; meetPlace?: string; expiresAt: number;
    decide?: { course?: string; date?: string; price?: string } };
  taken: number; total: number;
};
type Settings = {
  popupTitle: string; popupBody: string; targetGender: '' | 'male' | 'female';
  targetAreas: string[]; snoozeDays: number; filledMessage: string; showFareCard: boolean;
};

const STAGE_LABEL: Record<string, string> = {
  recruiting: '募集中', deciding: '日程を調整中', confirmed: '確定ずみ', closed: '終了',
};
const fmt = (ms?: number) => ms ? new Date(ms).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '—';

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // 新規作成
  const [pattern, setPattern] = useState<'women' | 'meetup'>('women');
  const [place, setPlace] = useState('新宿');
  const [expireDays, setExpireDays] = useState('14');

  useEffect(() => {
    const cached = search?.get('token') || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch { /* noop */ }
    })();
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    const q = `token=${encodeURIComponent(token)}`;
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/official?all=1&${q}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/official/settings?${q}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setThreads(a?.threads || []);
      setS(b?.settings || null);
    } catch { /* noop */ }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const active = threads.find((t) => t.official.stage === 'recruiting' || t.official.stage === 'deciding');

  async function create() {
    if (active) { setMsg('❌ すでに動いている枠があります。先に終わらせてください。'); return; }
    if (!window.confirm('この内容で枠を立てますか？')) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, meetPlace: pattern === 'meetup' ? place : undefined, expireDays: Number(expireDays) || 14 }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j?.message || '作れませんでした');
      setMsg(`✅ 「${j.title}」を立てました`);
      await load();
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  // 出しっぱなしの枠を畳む。参加者がいるものは消さずに閉じる（履歴を残す）。
  async function finish(t: Thread, mode: 'close' | 'delete') {
    const q = `?token=${encodeURIComponent(token)}`;
    if (!window.confirm(mode === 'delete' ? 'この枠を削除しますか？' : 'この枠を閉じますか？（履歴には残ります）')) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official/${t.id}${q}`, { method: mode === 'delete' ? 'DELETE' : 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j?.message || 'できませんでした');
      setMsg(mode === 'delete' ? '🗑 削除しました' : '✅ 閉じました');
      await load();
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveSettings() {
    if (!s) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official/settings?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      });
      const j = await r.json();
      if (!j.ok) throw new Error('保存できませんでした');
      setMsg('✅ 保存しました');
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <Link href={`/admin?token=${token}`} className="text-[12px] text-blue font-bold">‹ 管理</Link>
      <div className="text-2xl font-black mt-1 mb-1">📣 運営が立てる枠</div>
      <div className="text-[11.5px] text-sub font-bold leading-relaxed mb-4">
        主催者を置かずに、枠だけ先に出す募集です。<b className="text-text">同時に走らせるのは1本まで。</b>
        声かけがぶつかって、どちらも埋まらなくなるのを避けるためです。
      </div>

      {msg && <div className="text-[12.5px] font-black text-center mb-3">{msg}</div>}

      {/* いま動いているもの */}
      <div className="bg-card rounded-xl shadow-card p-4 mb-3">
        <div className="text-[13px] font-black mb-2">いま動いている枠</div>
        {active ? (
          <Link href={`/round/${active.id}`} className="block border-2 border-orange bg-orange-light rounded-xl p-3">
            <div className="text-[14px] font-black">{active.title}</div>
            <div className="text-[11.5px] font-bold text-sub mt-1">
              {STAGE_LABEL[active.official.stage]} ・ {active.taken}/{active.total}人 ・ 締切 {fmt(active.official.expiresAt)}
            </div>
            {active.official.stage === 'deciding' && (
              <div className="text-[11px] font-bold text-orange mt-1">
                ⛳ {active.official.decide?.course || '未入力'} / 📅 {active.official.decide?.date || '未入力'} / 💰 {active.official.decide?.price || '未入力'}
              </div>
            )}
          </Link>
        ) : (
          <div className="text-[12px] text-muted font-bold py-2">ありません。下から立てられます。</div>
        )}
        {active && (
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => finish(active, 'close')} disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 border-border bg-white disabled:opacity-50">
              閉じる（履歴に残す）
            </button>
            {active.taken === 0 && (
              <button onClick={() => finish(active, 'delete')} disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 border-red text-red bg-white disabled:opacity-50">
                🗑 削除
              </button>
            )}
          </div>
        )}
      </div>

      {/* 立てる */}
      <div className={'bg-card rounded-xl shadow-card p-4 mb-3 ' + (active ? 'opacity-50' : '')}>
        <div className="text-[13px] font-black mb-2">枠を立てる</div>
        <div className="space-y-2">
          {([['women', '女性だけで、のんびりラウンド', '女性4人。免許を聞きます'],
             ['meetup', '駅に集まってラウンド', '女性2＋男性2。男性の1人は車あり']] as const).map(([k, t, d]) => (
            <button key={k} onClick={() => setPattern(k)} disabled={!!active}
              className={'w-full text-left p-3 rounded-xl border-2 ' + (pattern === k ? 'border-green bg-green-light' : 'border-border bg-white')}>
              <div className="text-[13px] font-black">{pattern === k ? '✓ ' : ''}{t}</div>
              <div className="text-[11px] font-bold text-sub mt-0.5">{d}</div>
            </button>
          ))}
        </div>
        {pattern === 'meetup' && (
          <label className="block mt-3">
            <span className="text-[12px] font-black">集合する駅</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} disabled={!!active}
              className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
          </label>
        )}
        <label className="block mt-3">
          <span className="text-[12px] font-black">締め切り（何日で静かに閉じるか）</span>
          <input inputMode="numeric" value={expireDays} disabled={!!active}
            onChange={(e) => setExpireDays(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))}
            className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
        </label>
        <button onClick={create} disabled={busy || !!active}
          className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-orange text-white disabled:opacity-50">
          {active ? '動いている枠があります' : 'この内容で立てる'}
        </button>
      </div>

      {/* 声かけと文面 */}
      {s && (
        <div className="bg-card rounded-xl shadow-card p-4 mb-3">
          <div className="text-[13px] font-black mb-2">ホームでの声かけ</div>
          <Text label="見出し" v={s.popupTitle} on={(v) => setS({ ...s, popupTitle: v })} />
          <Area label="本文" v={s.popupBody} on={(v) => setS({ ...s, popupBody: v })} rows={3} />
          <div className="mt-3">
            <div className="text-[12px] font-black mb-1">誰に出すか</div>
            <div className="flex gap-2">
              {([['', 'ぜんいん'], ['female', '女性だけ'], ['male', '男性だけ']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setS({ ...s, targetGender: k })}
                  className={'flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 ' + (s.targetGender === k ? 'border-green bg-green-light' : 'border-border bg-white')}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="block mt-3">
            <span className="text-[12px] font-black">「あとで」で何日消すか</span>
            <input inputMode="numeric" value={String(s.snoozeDays)}
              onChange={(e) => setS({ ...s, snoozeDays: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
              className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
          </label>
          <div className="text-[13px] font-black mt-4 mb-1">人がそろった瞬間にチャットへ流す文</div>
          <Area label="" v={s.filledMessage} on={(v) => setS({ ...s, filledMessage: v })} rows={6} />
          <button onClick={saveSettings} disabled={busy}
            className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-green text-white disabled:opacity-50">保存する</button>
        </div>
      )}

      {/* 履歴 */}
      <div className="bg-card rounded-xl shadow-card p-4">
        <div className="text-[13px] font-black mb-2">これまでの枠（{threads.length}）</div>
        {threads.filter((t) => t.id !== active?.id).map((t) => (
          <Link key={t.id} href={`/round/${t.id}`} className="block border-b border-hair py-2.5 last:border-0">
            <div className="text-[13px] font-black">{t.title}</div>
            <div className="text-[11px] font-bold text-sub mt-0.5">
              {fmt(t.createdAt)} ・ {STAGE_LABEL[t.official.stage] || t.official.stage} ・ {t.taken}/{t.total}人
            </div>
          </Link>
        ))}
        {threads.length === 0 && <div className="text-[12px] text-muted font-bold">まだありません</div>}
      </div>
      <div className="h-8" />
    </div>
  );
}

function Text({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block mt-2">
      <span className="text-[12px] font-black">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)}
        className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[13.5px] font-black" />
    </label>
  );
}

function Area({ label, v, on, rows }: { label: string; v: string; on: (v: string) => void; rows: number }) {
  return (
    <label className="block mt-2">
      {label && <span className="text-[12px] font-black">{label}</span>}
      <textarea value={v} rows={rows} onChange={(e) => on(e.target.value)}
        className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[13px] font-bold leading-relaxed" />
    </label>
  );
}
