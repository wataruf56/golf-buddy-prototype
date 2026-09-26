'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

// 運営向け：会員が出した「行ける日」を、日付ごとに名前・年齢・性別・車・エリア・最寄り駅つきで見る。
// ここを見て、運営がコースの予約とピックアップの調整をする（会員側には名前を出さない日付もある）。
type Row = { id: string; name: string; age: number; gender: string; car: string; area: string; nearestStation: string; avatarUrl: string; updatedAt: number };
type Resp = { byDate: Record<string, Row[]>; people: number; generatedAt: number };

const W = ['日', '月', '火', '水', '木', '金', '土'];
function dateLabel(iso: string): { md: string; w: string; dow: number } {
  const d = new Date(iso + 'T00:00:00');
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, w: W[d.getDay()], dow: d.getDay() };
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [data, setData] = useState<Resp | null>(null);
  const [withTest, setWithTest] = useState(false);
  const [onlyMin, setOnlyMin] = useState(0);   // この人数以上の日だけ
  const [err, setErr] = useState('');

  useEffect(() => {
    const cached = search?.get('token') || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch { /* 取れなければ手持ちのトークンで */ }
    })();
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setErr('');
    try {
      const r = await fetch(`/api/admin/availability?token=${encodeURIComponent(token)}${withTest ? '&includeTest=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) { setErr('読み込めませんでした: ' + (e as Error).message); }
  }, [token, withTest]);
  useEffect(() => { load(); }, [load]);

  const dates = Object.keys(data?.byDate || {}).sort().filter((d) => (data?.byDate[d]?.length || 0) >= onlyMin);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Link href={`/admin?token=${token}`} className="text-sm text-blue font-bold">← 管理トップ</Link>
      <div className="text-2xl font-black mt-1 mb-1">📅 行ける日（会員の空き）</div>
      <div className="text-[12px] text-sub font-bold mb-3 leading-relaxed">
        会員が「行ける」と出した日ごとに、誰が行けるかを並べています（20〜30代のみ）。
        会員側には年齢・性別・車だけが並び、名前とプロフィールは女性の会員にだけ開きます。
        最寄り駅はここでしか見えません。
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-[12px] font-bold flex items-center gap-1.5">
          <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} /> テスト垢も含める
        </label>
        <label className="text-[12px] font-bold flex items-center gap-1.5">
          <select value={onlyMin} onChange={(e) => setOnlyMin(Number(e.target.value))} className="border border-border rounded-lg px-2 py-1 bg-white">
            <option value={0}>すべての日</option>
            <option value={2}>2人以上の日</option>
            <option value={3}>3人以上の日</option>
            <option value={4}>4人以上の日（1組できる）</option>
          </select>
        </label>
        {data && <span className="text-[12px] text-sub font-bold ml-auto">出している人：{data.people}人 ／ 日付：{Object.keys(data.byDate).length}日</span>}
      </div>
      {err && <div className="text-[12px] text-red font-bold mb-2">{err}</div>}

      {data && dates.length === 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 text-[13px] font-bold text-sub">まだ「行ける日」を出している人がいません。</div>
      )}

      {dates.map((iso) => {
        const rows = data!.byDate[iso];
        const l = dateLabel(iso);
        const m = rows.filter((r) => r.gender === 'male').length;
        const f = rows.filter((r) => r.gender === 'female').length;
        const cars = rows.filter((r) => r.car === 'have').length;
        return (
          <div key={iso} className="bg-card rounded-xl shadow-card p-3 mb-3 border-2 border-border">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={'text-[16px] font-black ' + (l.dow === 0 ? 'text-orange' : l.dow === 6 ? 'text-blue' : '')}>{l.md}（{l.w}）</span>
              <span className="text-[12px] font-black bg-white border border-border rounded-full px-2 py-0.5">{rows.length}人</span>
              <span className="text-[11px] font-bold text-sub">男{m}・女{f}・車あり{cars}</span>
              {rows.length >= 4 && <span className="text-[11px] font-black text-green bg-green-light border border-green rounded-full px-2 py-0.5">1組できる</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-sub font-bold border-b border-hair">
                    <th className="py-1 pr-2">名前</th><th className="py-1 pr-2">年齢</th><th className="py-1 pr-2">性別</th><th className="py-1 pr-2">車</th><th className="py-1 pr-2">エリア</th><th className="py-1 pr-2">最寄り駅</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-hair last:border-0">
                      <td className="py-1.5 pr-2 font-bold whitespace-nowrap">
                        <a href={appProfileUrl(r.id)} target="_blank" rel="noreferrer" className="text-blue underline">{r.name}</a>
                      </td>
                      <td className="py-1.5 pr-2">{r.age || '-'}</td>
                      <td className={'py-1.5 pr-2 font-bold ' + (r.gender === 'female' ? 'text-sakura' : 'text-blue')}>{r.gender === 'female' ? '女' : r.gender === 'male' ? '男' : '-'}</td>
                      <td className="py-1.5 pr-2">{r.car === 'have' ? '🚗 あり' : r.car === 'none' ? 'なし' : '-'}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{r.area || '-'}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{r.nearestStation || <span className="text-muted">未入力</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
