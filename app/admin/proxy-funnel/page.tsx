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
type Thread = {
  id: string; title: string; stations: string[];
  driverId: string; driverWanted: boolean; stage: string; taken: number; total: number;
};

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
          </div>
        ))}
      </div>

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
