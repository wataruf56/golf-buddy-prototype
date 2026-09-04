'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理者の代理ラウンド募集のレポート。
//
// **2本のファネルに分けて出す。**見ている人が別（車を出せる人／誘われた人）なので、
// 1本に並べると、どこで人が減ったのかが読めなくなる。
//
// 数えているのは**人数**。同じ人が何度ホームを開いてもイベントは増えるが、
// それを足すと「見た人」が実際より多く見える。

type Step = { key: string; label: string; n: number; muted?: boolean; bad?: boolean };
type Member = { id: string; name: string; gender?: string; age?: number; area?: string; car?: string; isDriver?: boolean };
type Thread = {
  id: string; title: string; stations: string[];
  driverId: string; driverWanted: boolean; stage: string; taken: number; total: number;
  createdAt?: number; members?: Member[];
};
type Summary = {
  viewers: number; joined: number; inNow: number; left: number;
  joinRate: number | null; stayRate: number | null; people: number;
};
type Viewer = { userId: string; name?: string; ts: number; joined: boolean };
type Move = { userId: string; name?: string; ts: number; roundTitle?: string; by?: string; stayedMs?: number; role?: string };

const dt = (ms?: number) =>
  ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** 滞在の長さ。粗さは「18時間」「3日」で十分。 */
function stayText(ms?: number): string {
  if (!ms || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}時間`;
  return `${Math.round(h / 24)}日`;
}

/** 「男性・28歳・東京都・車あり」 */
function who(m: Member): string {
  return [
    m.gender === 'male' ? '男性' : m.gender === 'female' ? '女性' : '',
    m.age ? `${m.age}歳` : '', m.area || '',
    m.car === 'have' ? '車あり' : m.car === 'none' ? '車なし' : '',
  ].filter(Boolean).join('・');
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [days, setDays] = useState(30);
  const [driver, setDriver] = useState<Step[]>([]);
  const [rider, setRider] = useState<Step[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [viewerList, setViewerList] = useState<Viewer[]>([]);
  const [joiners, setJoiners] = useState<Move[]>([]);
  const [leavers, setLeavers] = useState<Move[]>([]);
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
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/admin/proxy-funnel?token=${encodeURIComponent(token)}&days=${days}`, { cache: 'no-store' });
      const text = await r.text();
      let j: any;
      try { j = JSON.parse(text); } catch { throw new Error(`${r.status} ${text.slice(0, 60)}`); }
      if (j.error) throw new Error(j.error);
      setDriver(j.driver || []); setRider(j.rider || []);
      setThreads(j.threads || []); setDoneCount(j.doneCount || 0);
      setSummary(j.summary || null); setViewerList(j.viewerList || []);
      setJoiners(j.joiners || []); setLeavers(j.leavers || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [token, days]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <div className="min-h-screen bg-bg p-5 text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <Link href={`/admin?token=${token}`} className="text-[12px] text-blue font-bold">‹ 管理</Link>
      <div className="text-2xl font-black mt-1 mb-1">🚗 代理ラウンド募集</div>
      <div className="text-[11.5px] text-sub font-bold leading-relaxed mb-3">
        運営が車を出せる人を先に見つけ、残りの参加者を代わりに集める機能のレポートです。
        <b className="text-text">見ている人が別なので、ファネルを2本に分けています。</b>
      </div>

      <div className="bg-card rounded-xl shadow-card p-3 mb-3">
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={'flex-1 py-2 rounded-lg text-[12px] font-black border-2 ' +
                (days === d ? 'border-green bg-green-light' : 'border-border bg-white')}>
              {d}日
            </button>
          ))}
        </div>
        <div className="text-[11px] font-bold text-muted mt-2">
          いま動いている枠 {threads.length}本 ／ これまでに立った枠 {doneCount}本
        </div>
      </div>

      {err && <div className="text-[12px] font-black text-red mb-2">❌ {err}</div>}
      {loading && <div className="text-[12px] text-muted mb-2">読み込み中...</div>}

      {/* 続けるか直すかを決めるための数字。ファネルより前に置く。
          細かい段より先に「見た→入った→残っている」が知りたいため。 */}
      {summary && (
        <div className="bg-card rounded-xl shadow-card p-3 mb-3">
          <div className="text-[13px] font-black mb-2">続けるか直すかの判断材料</div>
          <div className="grid grid-cols-2 gap-2">
            <Tile v={summary.viewers} l="見た人" n="声かけが出た" />
            <Tile v={summary.joined} l="入った人" n="実際に参加した" />
            <Tile v={summary.inNow} l="いま中にいる" n="枠に残っている" good />
            <Tile v={summary.left} l="抜けた人" n="入ったあとに離脱" bad />
          </div>
          <div className="mt-2 text-[12px] font-bold leading-relaxed">
            <div className="flex items-center gap-2 py-1 border-b border-hair">
              <span className="flex-1">見た人のうち、入った割合</span>
              <b className="text-[15px]">{summary.joinRate != null ? `${summary.joinRate}%` : '—'}</b>
            </div>
            <div className="flex items-center gap-2 py-1">
              <span className="flex-1">入った人のうち、残っている割合</span>
              <b className="text-[15px]">{summary.stayRate != null ? `${summary.stayRate}%` : '—'}</b>
            </div>
          </div>
          <div className="text-[11px] font-bold text-muted mt-2 leading-relaxed">
            <b className="text-sub">「—」は母数が5人に満たないため出していません。</b>
            3人中1人を33%と書くと、実態より確かなものに見えてしまいます。<br />
            この機能に触れた実人数は {summary.people}人です。
          </div>
        </div>
      )}

      <Funnel title="🚗 車を出せる人" note="プロフィールで「車あり」と答えた人だけが対象です" steps={driver} />
      <Funnel title="🚉 誘われた人" note="ドライバーが選んだ駅の、同じ都道府県にいる人が対象です" steps={rider} />

      <div className="bg-card rounded-xl shadow-card p-3 mt-3">
        <div className="text-[13px] font-black mb-2">いま動いている枠</div>
        {threads.length === 0 ? (
          <div className="text-[12px] text-muted font-bold leading-relaxed">
            動いている枠はありません。<br />
            車を出せる人が駅を登録すると、その場で1本立ちます。
          </div>
        ) : threads.map((t) => (
          <div key={t.id} className="border-2 border-hair rounded-lg p-2.5 mb-2 last:mb-0">
            <div className="text-[12.5px] font-black">{t.title}</div>
            <div className="text-[11px] font-bold text-sub mt-1 leading-relaxed">
              🚉 {t.stations.join('・') || '駅なし'}<br />
              {t.taken}/{t.total}人 ・ {t.stage === 'deciding' ? '日程とコースを相談中' : '募集中'}
            </div>
            {t.driverWanted && (
              <div className="text-[11px] font-black text-red mt-1">
                ⚠️ 車を出す人が抜けました。代わりを募集中です
              </div>
            )}
            {/* いま入室中の顔ぶれ。同じ人ばかりが回っているのか、
                新しい人が入っているのかで、打ち手が変わる。 */}
            {(t.members?.length || 0) > 0 && (
              <div className="mt-1.5 border-t border-hair pt-1.5">
                {t.members!.map((m) => (
                  <div key={m.id} className="text-[11.5px] font-bold leading-relaxed">
                    {m.isDriver && <span className="text-orange">🚗 </span>}
                    <b>{m.name}</b>
                    {who(m) && <span className="text-sub">　{who(m)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 誰が動いたか。人数だけでは「同じ人が繰り返しているのか、
          新しい人に届いているのか」が分からず、判断できない。 */}
      <List title="👀 声かけを見た人" note="そのあと参加したかどうかも出します"
        rows={viewerList.map((v) => ({
          key: v.userId + v.ts, name: v.name || v.userId, ts: v.ts,
          tail: v.joined ? '✅ 参加した' : '見ただけ', bad: !v.joined,
        }))} empty="まだ誰にも声かけが出ていません" />

      <List title="✅ 入った人" note="どの枠に、どうやって入ったか"
        rows={joiners.map((j) => ({
          key: j.userId + j.ts, name: j.name || j.userId, ts: j.ts,
          tail: `${j.roundTitle || ''}${j.role === 'driver' ? '（車を出す人）' : j.by === 'host' ? '（承認）' : ''}`,
        }))} empty="まだ誰も入っていません" />

      <List title="🚪 抜けた人" note="どれくらい居てから抜けたか。すぐ抜けているなら中身の問題です"
        rows={leavers.map((l) => ({
          key: l.userId + l.ts, name: l.name || l.userId, ts: l.ts,
          tail: `${l.roundTitle || ''}${l.stayedMs ? `・滞在 ${stayText(l.stayedMs)}` : ''}${l.by === 'host' ? '（外された）' : ''}`,
          bad: true,
        }))} empty="抜けた人はいません" />

      <div className="bg-card rounded-xl shadow-card p-3 mt-3 text-[11.5px] font-bold leading-relaxed text-sub">
        <div className="text-[12.5px] font-black text-text mb-1">数字の読み方</div>
        数えているのは<b className="text-text">人数</b>です（同じ人が何度開いても1人）。<br />
        動作確認に使ったテストアカウントは除いています。<br />
        「あとで抜けた」は入退室ログから数えています。誰がいつ抜けたかは
        <Link href={`/admin/group-log?token=${token}`} className="text-blue underline">🚪 入退室ログ</Link>で見られます。
      </div>
      <div className="h-8" />
    </div>
  );
}

function Funnel({ title, note, steps }: { title: string; note: string; steps: Step[] }) {
  // 一番上の段を100%として横幅を決める。0人でも段は消さない
  // （消すと「そこは通らなかった」のか「まだ誰も来ていない」のかが分からなくなる）。
  const top = Math.max(1, steps[0]?.n || 0);
  return (
    <div className="bg-card rounded-xl shadow-card p-3 mb-3">
      <div className="text-[13px] font-black">{title}</div>
      <div className="text-[11px] font-bold text-muted mt-0.5 mb-2">{note}</div>
      {steps.map((s) => (
        <div key={s.key} className="flex items-center gap-2 py-1.5 border-b border-hair last:border-b-0">
          <span className={'text-[12px] font-bold flex-1 min-w-0 ' +
            (s.bad ? 'text-red' : s.muted ? 'text-muted' : 'text-text')}>{s.label}</span>
          <span className="h-2 rounded-full bg-bg overflow-hidden w-[90px] flex-none">
            <i className={'block h-full ' + (s.bad ? 'bg-red' : s.muted ? 'bg-muted' : 'bg-orange')}
              style={{ width: `${Math.min(100, Math.round((s.n / top) * 100))}%` }} />
          </span>
          <span className="text-[13px] font-black tabular-nums w-[42px] text-right">{s.n}人</span>
        </div>
      ))}
    </div>
  );
}

function Tile({ v, l, n, good, bad }: { v: number; l: string; n: string; good?: boolean; bad?: boolean }) {
  return (
    <div className={'rounded-lg border-2 p-2 text-center ' +
      (good ? 'border-green bg-green-light' : bad ? 'border-red bg-red-light' : 'border-border bg-bg')}>
      <div className="text-[22px] font-black leading-none tabular-nums">{v}</div>
      <div className="text-[11.5px] font-black mt-1">{l}</div>
      <div className="text-[10px] font-bold text-muted">{n}</div>
    </div>
  );
}

/** 「誰が」の一覧。多いときは折りたたむ（開かないと全部が縦に伸びて他が読めない）。 */
function List({ title, note, rows, empty }: {
  title: string; note: string; empty: string;
  rows: { key: string; name: string; ts: number; tail?: string; bad?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 5);
  return (
    <div className="bg-card rounded-xl shadow-card p-3 mt-3">
      <div className="text-[13px] font-black">{title} <span className="text-[11px] text-muted">({rows.length}件)</span></div>
      <div className="text-[11px] font-bold text-muted mt-0.5 mb-1.5">{note}</div>
      {rows.length === 0 ? (
        <div className="text-[11.5px] font-bold text-muted">{empty}</div>
      ) : (
        <>
          {shown.map((r) => (
            <div key={r.key} className="text-[11.5px] font-bold leading-relaxed py-1 border-b border-hair last:border-b-0">
              <b>{r.name}</b>
              <span className="text-muted">　{dt(r.ts)}</span>
              {r.tail && <div className={r.bad ? 'text-sub' : 'text-sub'}>{r.tail}</div>}
            </div>
          ))}
          {rows.length > 5 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-black text-blue underline mt-1.5">
              {open ? '閉じる' : `残り${rows.length - 5}件を見る`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
