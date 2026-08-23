'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { DirectReviewCard } from '@/components/DirectReviewCard';

// 「友達の確認」——やり残しが1か所に集まる画面。
//   届いた … 友達申請。承認するとその場でレビューへ進む
//   QR    … QRでつながったが「同じ組？」にまだ答えていない人
//   送った … 自分が出した申請（返事待ち・取り消せる）
//
// QRタブは選ぶまで消えない。せかさない代わりに、**表示は新しい順に10人まで**に
// 絞る（サーバー側でスライス。データは消していないので、答えれば必ず出てくる）。
type U = { id: string; displayName?: string; avatar?: string; avatarUrl?: string; color?: string; age?: number; area?: string; gender?: string };
type Req = { id: string; fromId: string; toId: string; claim: 'same_group' | 'competition'; metAt: string; message?: string; createdAt: number };
type Qr = { id: string; otherId: string; linkedAt: number };
type Rev = { id: string; revieweeId: string; source: string; dueAt: number };
type Data = {
  incoming: Req[]; outgoing: Req[]; qr: Qr[]; qrTotal: number; qrHidden: number;
  reviews: Rev[]; users: Record<string, U>;
  counts: { incoming: number; qr: number; outgoing: number; reviews: number };
};

const CLAIM_LABEL: Record<string, string> = { same_group: '⛳ 同じ組で回った', competition: '🏆 同じコンペにいた' };
const fmt = (s: string) => (s || '').replace(/-/g, '/');

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-sub">読み込み中...</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const search = useSearchParams();
  const [tab, setTab] = useState<'incoming' | 'qr' | 'outgoing' | 'review'>(
    (search?.get('tab') as any) || 'incoming',
  );
  const me = useStore(getMe);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  // 承認画面で選んだ結果（申請IDごと）
  const [pick, setPick] = useState<Record<string, string>>({});
  // QRの回答（相手IDごと）
  const [qrPick, setQrPick] = useState<Record<string, 'same_group' | 'other'>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/friends/requests', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch { setData({ incoming: [], outgoing: [], qr: [], qrTotal: 0, qrHidden: 0, reviews: [], users: {}, counts: { incoming: 0, qr: 0, outgoing: 0, reviews: 0 } }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // レビュー待ちがあるのに tab 指定が無いときは、最初にレビューを見せる。
  useEffect(() => {
    if (!data) return;
    if (!search?.get('tab') && data.counts.reviews > 0 && data.counts.incoming === 0) setTab('review');
  }, [data, search]);

  async function respond(req: Req) {
    const result = pick[req.id];
    if (!result) { toast('どれか選んでください', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/friends/requests/${req.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || '失敗しました');
      if (result === 'none') toast('この申請を閉じました');
      else if (result === 'same_group') toast('🤝 友達になりました。評価をお願いします');
      else toast('🤝 友達になりました');
      await load();
      if (result === 'same_group') setTab('review');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function cancel(req: Req) {
    setBusy(true);
    try {
      await fetch(`/api/friends/requests/${req.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }), credentials: 'include',
      });
      toast('申請を取り消しました');
      await load();
    } catch { toast('失敗しました', 'error'); }
    finally { setBusy(false); }
  }

  async function submitQr() {
    const answers = Object.entries(qrPick).map(([otherId, answer]) => ({ otherId, answer }));
    if (!answers.length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/friends/qr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || '失敗しました');
      toast(j.sameGroup > 0
        ? `${answers.length}人ぶんを記録しました。評価は明日お願いします`
        : `${answers.length}人ぶんを記録しました`);
      setQrPick({});
      await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!data) return <div className="p-6 text-sm text-sub">読み込み中...</div>;

  const u = (id: string): U => data.users[id] || { id, displayName: 'ゴルファー' };
  const qrChosen = Object.keys(qrPick).length;

  const TABS: Array<[typeof tab, string, number]> = [
    ['incoming', '届いた', data.counts.incoming],
    ['qr', 'QR', data.counts.qr],
    ['review', '評価', data.counts.reviews],
    ['outgoing', '送った', data.counts.outgoing],
  ];

  return (
    <div className="pb-24">
      <div className="px-5 pt-2 pb-1 flex items-center gap-2">
        <button onClick={() => router.back()} className="text-lg" aria-label="戻る">←</button>
        <span className="text-2xl font-black tracking-tight">友達の確認</span>
      </div>
      <div className="px-5 text-[12px] text-sub mb-3 leading-relaxed">
        届いた友達申請と、QRでつながった人の「同じ組だったか」の確認。<b className="text-text">答えるまで消えません。</b>
      </div>

      <div className="px-5 flex gap-1.5 mb-4">
        {TABS.map(([k, label, n]) => (
          <button
            key={k} onClick={() => setTab(k)}
            className={'flex-1 py-2 rounded-full text-[12px] font-bold border-[1.5px] ' +
              (tab === k ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
          >{label}{n > 0 ? `（${n}）` : ''}</button>
        ))}
      </div>

      {/* ── 届いた申請 ── */}
      {tab === 'incoming' && (
        <div className="px-5 space-y-3">
          {data.incoming.length === 0 && <Empty text="届いている申請はありません" />}
          {data.incoming.map((r) => {
            const p = u(r.fromId);
            const sel = pick[r.id];
            return (
              <div key={r.id} className="bg-card border-2 border-border rounded-card shadow-card p-4">
                <Link href={`/profile/${r.fromId}`} className="flex items-center gap-3">
                  <Avatar user={p as any} size={44} emojiSize={22} />
                  <div>
                    <div className="text-[15px] font-black">{p.displayName}</div>
                    <div className="text-[11.5px] text-sub">{[p.age ? `${p.age}歳` : '', p.area].filter(Boolean).join('・')}</div>
                  </div>
                </Link>
                {r.message && (
                  <div className="mt-2.5 border-2 border-dashed border-border rounded-xl p-2.5 text-[12.5px] font-bold">
                    「{r.message}」
                  </div>
                )}
                <div className="mt-3 text-[13px] font-black leading-relaxed">
                  {p.displayName}さんは<br />
                  <span className="text-orange">「{fmt(r.metAt)} に{r.claim === 'same_group' ? '同じ組で回った' : '同じコンペにいた'}」</span>と言っています。
                </div>
                <div className="text-[11px] font-black text-sub mt-3 mb-1.5">合っていますか？</div>
                <div className="space-y-2">
                  {[
                    ['same_group', '⛳ はい、同じ組でした', '友達に追加し、評価へ進みます'],
                    ['competition', '🏆 コンペで一緒だっただけ', '友達に追加のみ（評価はしません）'],
                    ['none', '🤔 心当たりがない', '追加しません'],
                  ].map(([k, label, note]) => (
                    <button
                      key={k} onClick={() => setPick((s) => ({ ...s, [r.id]: k }))}
                      className={'w-full text-left border-2 rounded-xl px-3 py-2.5 ' +
                        (sel === k ? 'bg-green-light border-green' : 'bg-white border-border')}
                    >
                      <div className="text-[13px] font-black">{label}</div>
                      <div className="text-[11px] font-bold text-sub mt-0.5">{note}</div>
                    </button>
                  ))}
                </div>
                <button
                  disabled={busy || !sel} onClick={() => respond(r)}
                  className={'w-full mt-3 py-3 rounded-xl text-[15px] font-black border-2 ' +
                    (sel ? 'bg-green text-white border-green' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}
                >{sel === 'none' ? '閉じる' : '許可する'}</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── QRでつながった人 ── */}
      {tab === 'qr' && (
        <div className="px-5">
          <div className="flex gap-2 mb-4">
            <Link href="/qr?mode=scan" className="flex-1 text-center bg-orange text-white border-2 border-border rounded-xl py-2.5 text-[12.5px] font-black shadow-card">
              <span className="block text-lg leading-tight">📷</span>続けて読み取る
            </Link>
            <Link href="/qr?mode=mine" className="flex-1 text-center bg-card border-2 border-border rounded-xl py-2.5 text-[12.5px] font-black shadow-card">
              <span className="block text-lg leading-tight">🪪</span>自分のQRを表示
            </Link>
          </div>
          {data.qr.length === 0 ? (
            <Empty text="確認まちの人はいません" />
          ) : (
            <>
              <div className="text-[13px] font-black mb-2">
                同じ組で回りましたか？<span className="text-sub font-bold">（{data.qrTotal}人）</span>
              </div>
              <div className="space-y-2.5">
                {data.qr.map((q) => {
                  const p = u(q.otherId);
                  const a = qrPick[q.otherId];
                  return (
                    <div key={q.id} className="bg-card border-2 border-border rounded-xl p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={p as any} size={34} emojiSize={17} />
                        <div>
                          <div className="text-[14px] font-black">{p.displayName}</div>
                          <div className="text-[11px] text-sub">
                            {new Date(q.linkedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} につながった
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => setQrPick((s) => ({ ...s, [q.otherId]: 'same_group' }))}
                          className={'flex-1 py-2 rounded-lg text-[12px] font-black border-2 ' +
                            (a === 'same_group' ? 'bg-orange text-white border-orange' : 'bg-white border-border')}
                        >⛳ 同じ組</button>
                        <button
                          onClick={() => setQrPick((s) => ({ ...s, [q.otherId]: 'other' }))}
                          className={'flex-1 py-2 rounded-lg text-[12px] font-black border-2 ' +
                            (a === 'other' ? 'bg-green text-white border-green' : 'bg-white border-border')}
                        >✋ 別の組</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.qrHidden > 0 && (
                <div className="text-[11.5px] font-bold text-sub text-center mt-3 leading-relaxed">
                  ほかに{data.qrHidden}人います。<br />いま出ている人に答えると、続きが出てきます。
                </div>
              )}
              <button
                disabled={busy || qrChosen === 0} onClick={submitQr}
                className={'w-full mt-4 py-3 rounded-xl text-[15px] font-black border-2 ' +
                  (qrChosen ? 'bg-green text-white border-green' : 'bg-[#EDEDED] text-[#A9A9A9] border-muted')}
              >決定する{qrChosen ? `（${qrChosen}人）` : ''}</button>
              <div className="text-[11px] text-muted font-bold text-center mt-2 leading-relaxed">
                「同じ組」にした人の評価は、明日おねがいします。
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 評価（ラウンドに紐づかないレビュー） ── */}
      {tab === 'review' && (
        <div className="px-5 space-y-3">
          {data.reviews.length === 0 && <Empty text="評価まちの人はいません" />}
          {data.reviews.map((rv) => (
            <DirectReviewCard
              key={rv.id} user={u(rv.revieweeId) as any} meGender={me?.gender}
              onDone={load}
            />
          ))}
        </div>
      )}

      {/* ── 送った申請 ── */}
      {tab === 'outgoing' && (
        <div className="px-5 space-y-3">
          {data.outgoing.length === 0 && <Empty text="送った申請はありません" />}
          {data.outgoing.map((r) => {
            const p = u(r.toId);
            return (
              <div key={r.id} className="bg-card border-2 border-border rounded-xl p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar user={p as any} size={34} emojiSize={17} />
                  <div className="flex-1">
                    <div className="text-[14px] font-black">{p.displayName}</div>
                    <div className="text-[11px] text-sub">{CLAIM_LABEL[r.claim]}・{fmt(r.metAt)}</div>
                  </div>
                  <span className="text-[11px] font-black text-yellow bg-yellow-light border border-yellow rounded-full px-2 py-0.5">⏳ 返事待ち</span>
                </div>
                <button
                  disabled={busy} onClick={() => cancel(r)}
                  className="w-full mt-2.5 py-2 rounded-lg text-[12px] font-bold border-2 border-hair bg-white text-muted"
                >取り消す</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-[13px] font-bold text-muted">{text}</div>
  );
}
