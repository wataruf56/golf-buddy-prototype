'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

// グループの入退室ログ。**誰がいつ入って、いつ抜けたか**をグループごとに見る。
//
// 操作ログ（📒）は「運営が何をしたか」の台帳なので、会員の出入りが混ざると読めなくなる。
// そこで同じデータを、出入りだけ・グループ単位・人単位に組み直したのがこの画面。
//
// 「入った時刻が空」の行は、記録を入れる前から居た人。分からないものは空のまま出す
// （それらしい時刻を埋めると、あとで数字を信じられなくなる）。

type Stay = {
  userId: string; userName?: string;
  joinedAt?: number; leftAt?: number; stayedMs?: number;
  joinBy?: string; leaveBy?: string; inNow: boolean;
  gender?: string; age?: number; area?: string; car?: string;
  isDriver?: boolean; visit?: number;
};
type Ev = { ts: number; kind: 'join' | 'leave'; userId: string; userName?: string; by?: string };
type Info = {
  exists: boolean; status: string; members: number; maxSpots: number;
  proxy: boolean; stations: string[]; driverId: string; driverWanted: boolean; stage: string;
};
type Group = {
  groupId: string; title: string; official: boolean; info?: Info | null;
  stays: Stay[]; current: Stay[]; events: Ev[];
  inNow: number; leftCount: number; peopleCount: number; lastTs: number;
};

/** 「男性・28歳・東京都・車あり」のように、その人が誰か分かる一行。 */
function who(s: Stay): string {
  const p = [
    s.gender === 'male' ? '男性' : s.gender === 'female' ? '女性' : '',
    s.age ? `${s.age}歳` : '',
    s.area || '',
    s.car === 'have' ? '車あり' : s.car === 'none' ? '車なし' : '',
  ].filter(Boolean);
  return p.join('・');
}

const fmt = (ms?: number) =>
  ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** 滞在の長さ。「18時間」「3日」くらいの粗さで十分。 */
function stayText(ms?: number): string {
  if (!ms || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}時間`;
  return `${Math.round(h / 24)}日`;
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [days, setDays] = useState(30);
  const [user, setUser] = useState('');
  const [withTest, setWithTest] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

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
    const uid = search?.get('userId');
    if (uid) setUser(uid);
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ token, days: String(days) });
      if (user) q.set('userId', user);
      if (withTest) q.set('includeTest', '1');
      const r = await fetch(`/api/admin/group-log?${q}`, { cache: 'no-store' });
      const text = await r.text();
      let j: any;
      try { j = JSON.parse(text); } catch { throw new Error(`${r.status} ${text.slice(0, 60)}`); }
      if (j.error) throw new Error(j.error);
      setGroups(j.groups || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [token, days, user, withTest]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <div className="min-h-screen bg-bg p-5 text-sm text-muted">⚙️ 読み込み中...</div>;

  const totalIn = groups.reduce((n, g) => n + g.inNow, 0);
  const totalOut = groups.reduce((n, g) => n + g.leftCount, 0);

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <Link href={`/admin/official?token=${token}`} className="text-[12px] text-blue font-bold">‹ 代理ラウンド募集</Link>
      <div className="text-2xl font-black mt-1 mb-1">🚪 入退室ログ</div>
      <div className="text-[11.5px] text-sub font-bold leading-relaxed mb-3">
        <b className="text-text">代理ラウンド募集（運営が代わりに立てる枠）</b>の出入りだけを並べています。
        誰がいつ入って、いつ抜けたか。自分で抜けたのか外されたのかも残ります。<br />
        普通の募集や公式コンペの出入りは、ここには出しません。
      </div>

      <div className="bg-card rounded-xl shadow-card p-3 mb-3">
        <div className="flex gap-2 mb-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={'flex-1 py-2 rounded-lg text-[12px] font-black border-2 ' +
                (days === d ? 'border-green bg-green-light' : 'border-border bg-white')}>
              {d}日
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={user} onChange={(e) => setUser(e.target.value)}
            placeholder="この人の出入りだけ（会員IDを貼る）"
            className="flex-1 min-w-0 border-2 border-border rounded-lg px-2 py-2 text-[12px] font-bold bg-white" />
          {!!user && (
            <button onClick={() => setUser('')}
              className="px-3 rounded-lg text-[12px] font-black border-2 border-border bg-white">解除</button>
          )}
        </div>
        <label className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-muted">
          <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} />
          テストアカウント（test_）の出入りも混ぜる
        </label>
        <div className="text-[11px] font-bold text-muted mt-1">
          いま中にいる {totalIn}人 ／ 抜けた {totalOut}件
        </div>
      </div>

      {err && <div className="text-[12px] font-black text-red mb-2">❌ {err}</div>}
      {loading && <div className="text-[12px] text-muted mb-2">読み込み中...</div>}
      {!loading && groups.length === 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 text-[12.5px] leading-relaxed">
          この条件の出入りはありません。<br />
          <span className="text-muted">入退室ログは記録を入れた日から貯まります。それ以前の出入りは残っていません。</span>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.groupId} className="bg-card rounded-xl shadow-card p-3">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {g.official && (
                <span className="text-[10.5px] font-black border rounded-full px-2 py-0.5 bg-green-light border-green text-green">運営の枠</span>
              )}
              <span className="text-[13px] font-black flex-1 min-w-0 break-all">{g.title}</span>
            </div>
            {/* 枠そのものの状況。代理ラウンド募集なら駅と車を出す人まで出す。
                題名の文字列だけだと、どの枠の出入りなのかが分からない。 */}
            {g.info?.exists ? (
              <div className="text-[11px] font-bold text-sub mb-2 leading-relaxed bg-bg border border-hair rounded-lg p-2">
                {g.info.proxy && <span className="text-orange font-black">🚗 代理ラウンド募集　</span>}
                {g.info.members}/{g.info.maxSpots}人
                ・{g.info.stage === 'deciding' ? '日程とコースを相談中'
                  : g.info.status === 'closed' ? '締切' : '募集中'}
                {g.info.stations?.length > 0 && <><br />🚉 {g.info.stations.join('・')}</>}
                {g.info.driverWanted && (
                  <><br /><span className="text-red font-black">⚠️ 車を出す人が抜けました。代わりを募集中です</span></>
                )}
              </div>
            ) : (
              <div className="text-[11px] font-bold text-muted mb-2">
                この枠はもうありません（削除済み）
              </div>
            )}

            {/* いま中にいる人。ここが「誰が入っているか」の答えなので先に出す。
                抜けた人と混ぜて並べると、探さないと分からない。 */}
            <div className="border-2 border-green rounded-lg p-2.5 mb-2 bg-green-light">
              <div className="text-[12px] font-black text-green-dark mb-1.5">
                いま中にいる人（{g.inNow}人）
              </div>
              {g.current.length === 0 ? (
                <div className="text-[11.5px] font-bold text-muted">誰もいません</div>
              ) : (
                <div className="space-y-1">
                  {g.current.map((c) => (
                    <div key={c.userId} className="flex items-start gap-1.5 flex-wrap">
                      <span className="text-[12.5px] font-black">{c.userName || '(名前なし)'}</span>
                      {c.isDriver && (
                        <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border border-orange text-orange bg-white">🚗 車を出す人</span>
                      )}
                      {(c.visit || 1) > 1 && (
                        <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border border-border text-sub bg-white">{c.visit}回目</span>
                      )}
                      <span className="text-[11px] font-bold text-sub w-full">
                        {who(c) && <>{who(c)}　</>}
                        {c.joinedAt ? `${fmt(c.joinedAt)} から` : '記録なし（ログを入れる前から参加）'}
                        {c.joinBy === 'host' && '（主催者が承認）'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-[11px] font-bold text-muted mb-1.5">
              出入りの記録（のべ {g.stays.length}件 ／ 実人数 {g.peopleCount}人）・最終 {fmt(g.lastTs)}
            </div>

            <div className="space-y-1.5">
              {g.stays.map((s, i) => (
                <div key={`${s.userId}-${i}`}
                  className={'rounded-lg border p-2 ' + (s.inNow ? 'border-green bg-green-light' : 'border-hair bg-bg')}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12.5px] font-black">{s.userName || '(名前なし)'}</span>
                    {s.isDriver && (
                      <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border border-orange text-orange bg-white">🚗</span>
                    )}
                    {(s.visit || 1) > 1 && (
                      <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border border-border text-sub bg-white">{s.visit}回目</span>
                    )}
                    <span className={'text-[10px] font-black rounded-full px-1.5 py-0.5 border bg-white ' +
                      (s.inNow ? 'border-green text-green' : 'border-border text-muted')}>
                      {s.inNow ? 'いま中にいる' : '抜けた'}
                    </span>
                    <a href={appProfileUrl(s.userId)} className="text-[10.5px] font-black text-blue underline ml-auto">プロフィール</a>
                  </div>
                  {who(s) && <div className="text-[11px] font-bold text-sub mt-0.5">{who(s)}</div>}
                  <div className="text-[11.5px] font-bold leading-relaxed mt-1">
                    <div>
                      入った：{s.joinedAt ? fmt(s.joinedAt) : <span className="text-muted">記録なし（ログを入れる前から参加）</span>}
                      {s.joinBy === 'host' && <span className="text-muted">（主催者が承認）</span>}
                    </div>
                    <div>
                      抜けた：{s.leftAt ? fmt(s.leftAt) : <span className="text-muted">まだ抜けていません</span>}
                      {s.leaveBy === 'host' && <span className="text-red">（運営・主催者が外した）</span>}
                      {s.stayedMs ? <span className="text-muted">　滞在 {stayText(s.stayedMs)}</span> : null}
                    </div>
                  </div>
                  <button onClick={() => setUser(s.userId)}
                    className="text-[10.5px] font-black text-blue underline mt-1">この人の出入りだけ見る</button>
                </div>
              ))}
            </div>

            <button onClick={() => setOpen(open === g.groupId ? null : g.groupId)}
              className="text-[11px] font-black text-muted underline mt-2">
              {open === g.groupId ? '時系列を閉じる' : '時系列で見る'}
            </button>
            {open === g.groupId && (
              <div className="mt-2 border-t border-hair pt-2 space-y-1">
                {g.events.map((e, i) => {
                  // その時点で何人になったかを添える。行だけ並んでいても増減が読めない。
                  const upto = g.events.slice(i).reduce((n, x) => n + (x.kind === 'join' ? 1 : -1), 0);
                  return (
                    <div key={`${e.ts}-${i}`} className="text-[11.5px] font-bold leading-relaxed">
                      <span className="text-muted">{fmt(e.ts)}</span>{' '}
                      <span className={e.kind === 'join' ? 'text-green' : 'text-orange'}>
                        {e.kind === 'join' ? '＋' : '−'}
                      </span>{' '}
                      {e.userName || e.userId} さんが{e.kind === 'join' ? '入った' : '抜けた'}
                      {e.by === 'host' && <span className="text-muted">（{e.kind === 'join' ? '承認' : '外された'}）</span>}
                      <span className="text-muted">　→ {Math.max(0, upto)}人</span>
                    </div>
                  );
                })}
                <div className="text-[10.5px] text-muted font-bold pt-1 break-all">グループID: {g.groupId}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="h-8" />
    </div>
  );
}
