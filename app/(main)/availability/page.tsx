'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { AvailLegend, AvailPersonChip } from '@/components/AvailPersonChip';
import { dateLabel, isoOf, monthsBetween, WEEKDAYS, type AvailPerson } from '@/lib/availabilityShared';

// 「行ける日」カレンダー（モック3版・2026-09-27）。
//   ・1か月ずつ。‹ › で月を切り替える（今日から約3か月先まで）
//   ・日付を押すと、その日に行ける人がカレンダーのすぐ下に出る
//   ・「この日に行ける」を押すとその場で保存。押し直すと外れる
//   ・車を出せる人は、乗れる人数（運転手込み）とバッグの数を 2〜8 で選ぶ
//   ・車あり／なしはプロフィールの値（ここで変えるとプロフィールも変わる）
//   ・最寄り駅が未登録の人は、見るのはできるが出せない。登録を案内し、済んだら使える
//   ・20〜30代にだけ出る。並ぶのも同じ年代だけ（API 側で決まる）
type Resp = {
  enabled: boolean; needsStation?: boolean;
  byDate: Record<string, AvailPerson[]>; mine: string[];
  car: 'have' | 'none'; seats: number | null; bags: number | null;
  canOpenProfiles: boolean;
  window: { from: string; to: string; days: number };
};
const NUMS = [2, 3, 4, 5, 6, 7, 8];
const RETURN_TO = '/mypage/edit?returnTo=' + encodeURIComponent('/availability');

export default function AvailabilityPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const [data, setData] = useState<Resp | null>(null);
  const [failed, setFailed] = useState(false);
  const [monthIdx, setMonthIdx] = useState(0);
  const [focusIso, setFocusIso] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/availability', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      const d: Resp = await r.json();
      setData(d);
      setFocusIso((cur) => cur || d.window?.from || '');
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const months = useMemo(() => (data?.enabled ? monthsBetween(data.window.from, data.window.to) : []), [data]);
  const month = months[monthIdx];
  const today = data?.window.from || '';
  const limit = data?.window.to || '';
  const mine = useMemo(() => new Set(data?.mine || []), [data]);

  // 自分の札。まだ1日も出していないと一覧に居ないので、プロフィールから作る
  const mePerson = useMemo<AvailPerson>(() => {
    const found = Object.values(data?.byDate || {}).flat().find((p) => p.me);
    if (found) return found;
    return {
      age: me.age, gender: (me.gender === 'female' ? 'female' : 'male'), car: data?.car === 'have', me: true,
      ...(data?.seats ? { seats: data.seats } : {}), ...(data?.bags ? { bags: data.bags } : {}),
      id: me.id, name: me.displayName, avatar: me.avatar, avatarUrl: me.avatarUrl, avatarMode: me.avatarMode, color: me.color, golmotiType: me.golmotiType,
    };
  }, [data, me]);

  const othersOn = useCallback((iso: string) => (data?.byDate[iso] || []).filter((p) => !p.me), [data]);
  const listFor = useCallback((iso: string) => (mine.has(iso) ? [...othersOn(iso), mePerson] : othersOn(iso)), [mine, othersOn, mePerson]);

  /** 保存。日付・車・乗れる人数・バッグ数をまとめて送る（サーバーは全部まとめて持つ） */
  async function save(next: { dates?: string[]; car?: 'have' | 'none'; seats?: number | null; bags?: number | null }, revert: Resp) {
    setBusy(true);
    try {
      const car = next.car ?? revert.car;
      let seats = next.seats === undefined ? revert.seats : next.seats;
      let bags = next.bags === undefined ? revert.bags : next.bags;
      // 車を出せる人は、画面に出ている初期値（4人・3個）をそのまま保存する（未設定のままにしない）
      if (car === 'have') { seats = seats || 4; bags = bags || 3; }
      const body = { dates: next.dates ?? revert.mine, car, seats, bags };
      const r = await fetch('/api/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setData(revert);
        if (j?.code === 'needs_station') { setData({ ...revert, needsStation: true }); }
        toast(j?.message || '保存できませんでした', 'error');
        return;
      }
      // サーバーが持っている値に合わせる（初期値を入れた分など）
      setData((cur) => (cur ? { ...cur, seats: j?.seats ?? cur.seats, bags: j?.bags ?? cur.bags } : cur));
      if (next.car && next.car !== revert.car) { store.refreshMe().catch(() => {}); }
    } catch {
      setData(revert);
      toast('保存できませんでした', 'error');
    } finally { setBusy(false); }
  }

  function toggleDay(iso: string) {
    if (!data || busy) return;
    const dates = mine.has(iso) ? data.mine.filter((d) => d !== iso) : [...data.mine, iso].sort();
    setData({ ...data, mine: dates });   // 先に見た目を返す
    save({ dates }, data);
  }
  function setCar(car: 'have' | 'none') {
    if (!data || busy || data.car === car) return;
    const seats = car === 'have' ? (data.seats || 4) : data.seats;
    const bags = car === 'have' ? (data.bags || 3) : data.bags;
    setData({ ...data, car, seats, bags });
    save({ car, seats, bags }, data);
  }
  function setCarNum(key: 'seats' | 'bags', v: number) {
    if (!data || busy) return;
    setData({ ...data, [key]: v });
    save({ [key]: v }, data);
  }
  function goMonth(delta: number) {
    const idx = Math.min(months.length - 1, Math.max(0, monthIdx + delta));
    setMonthIdx(idx);
    const m = months[idx];
    // 新しい月の、選べる最初の日を見せる
    const first = isoOf(m.y, m.m0, 1);
    setFocusIso(first < today ? today : first);
  }

  if (failed) {
    return <div className="px-5 py-8 text-center text-sm font-bold text-sub">読み込めませんでした。しばらくしてから開き直してください。</div>;
  }
  if (!data) return <div className="px-5 py-8 text-center text-sm font-bold text-sub">読み込み中…</div>;
  if (!data.enabled) {
    return (
      <div className="px-5 py-6">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
        <div className="bg-card rounded-card shadow-card border-2 border-border p-5 text-[13px] font-bold text-sub leading-relaxed">
          「行ける日」は20〜30代の会員向けの機能です。
        </div>
      </div>
    );
  }

  const fl = focusIso ? dateLabel(focusIso) : null;
  const focusOthers = focusIso ? othersOn(focusIso) : [];
  const focusOn = mine.has(focusIso);
  const focusCars = listFor(focusIso).filter((p) => p.car);
  const focusSeats = focusCars.reduce((n, p) => n + (p.seats || 4), 0);

  return (
    <div className="px-5 pt-2 pb-8">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
      </div>
      <div className="text-2xl font-black tracking-tight">📅 行ける日</div>
      <div className="text-[12px] text-sub font-bold mt-1 leading-relaxed">
        行ける日を押しておくと、運営が日付ごとに人をまとめて、コースを押さえて案内します。
        同年代（20〜30代）の会員だけに出ます。
      </div>

      {data.needsStation && (
        <div className="mt-3 bg-orange-light border-2 border-orange rounded-card p-4">
          <div className="text-[14px] font-black text-orange">🚉 最寄り駅を登録してください</div>
          <div className="text-[12px] font-bold text-text mt-1.5 leading-relaxed">
            「行ける日」は、最寄り駅の近さで乗り合いや集合駅を決めるために使います。
            プロフィールで最寄り駅を登録すると、この画面から行ける日を出せるようになります。
            最寄り駅はほかの会員には表示されません（運営だけが確認します）。
          </div>
          <Link href={RETURN_TO} className="block w-full mt-3 py-3 rounded-xl border-2 border-border bg-orange text-white text-center text-[14px] font-black">
            プロフィールで最寄り駅を登録する
          </Link>
        </div>
      )}

      <div className="mt-3 bg-card rounded-card shadow-card border-2 border-border p-4">
        {!data.needsStation && (
          <>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="車">
              <button type="button" aria-pressed={data.car === 'have'} disabled={busy} onClick={() => setCar('have')}
                className={`py-2.5 rounded-xl border-2 text-[13px] font-black ${data.car === 'have' ? 'border-border bg-orange-light text-text' : 'border-hair bg-white text-sub'}`}>
                🚗 車を出せる
              </button>
              <button type="button" aria-pressed={data.car === 'none'} disabled={busy} onClick={() => setCar('none')}
                className={`py-2.5 rounded-xl border-2 text-[13px] font-black ${data.car === 'none' ? 'border-border bg-orange-light text-text' : 'border-hair bg-white text-sub'}`}>
                車なし
              </button>
            </div>
            {data.car === 'have' && (
              <div className="mt-2 border-2 border-border rounded-xl bg-white p-3 flex flex-col gap-2">
                <label className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px] font-black">
                  <span>乗れる人数<span className="block text-[10px] text-sub font-bold">運転手を含めて</span></span>
                  <select value={data.seats || 4} disabled={busy} onChange={(e) => setCarNum('seats', Number(e.target.value))}
                    className="font-black px-3 py-1.5 rounded-lg border-2 border-border bg-card">
                    {NUMS.map((n) => <option key={n} value={n}>{n}人</option>)}
                  </select>
                </label>
                <label className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px] font-black">
                  <span>ゴルフバッグ<span className="block text-[10px] text-sub font-bold">積める数</span></span>
                  <select value={data.bags || 3} disabled={busy} onChange={(e) => setCarNum('bags', Number(e.target.value))}
                    className="font-black px-3 py-1.5 rounded-lg border-2 border-border bg-card">
                    {NUMS.map((n) => <option key={n} value={n}>{n}個</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="text-[11px] text-sub font-bold mt-1.5 leading-relaxed">車あり／なしはプロフィールの値です。ここで変えるとプロフィールも変わります。</div>
          </>
        )}

        {/* 1か月ずつのカレンダー */}
        <div className={data.needsStation ? '' : 'mt-3'}>
          <div className="grid grid-cols-[36px_1fr_36px] items-center mb-2">
            <button type="button" aria-label="前の月" disabled={monthIdx <= 0} onClick={() => goMonth(-1)}
              className="w-9 h-9 rounded-lg border-2 border-border bg-white font-black text-base disabled:opacity-30">‹</button>
            <div className="text-center text-[15px] font-black">{month ? `${month.y}年${month.m0 + 1}月` : ''}</div>
            <button type="button" aria-label="次の月" disabled={monthIdx >= months.length - 1} onClick={() => goMonth(1)}
              className="w-9 h-9 rounded-lg border-2 border-border bg-white font-black text-base disabled:opacity-30">›</button>
          </div>
          {month && (
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={`text-center text-[10px] font-black pb-0.5 ${i === 0 ? 'text-orange' : i === 6 ? 'text-blue' : 'text-sub'}`}>{w}</div>
              ))}
              {Array.from({ length: new Date(month.y, month.m0, 1).getDay() }).map((_, i) => <span key={`pad${i}`} />)}
              {Array.from({ length: new Date(month.y, month.m0 + 1, 0).getDate() }).map((_, i) => {
                const d = i + 1;
                const iso = isoOf(month.y, month.m0, d);
                const past = iso < today;
                const beyond = iso > limit;
                const on = mine.has(iso);
                const others = othersOn(iso);
                const dots = others.slice(0, 4);
                const cls = [
                  'aspect-square rounded-[10px] border-[1.5px] grid grid-rows-[1fr_auto] place-items-center text-[13px] font-mono font-extrabold p-0 relative',
                  past || beyond ? 'text-muted bg-transparent border-dashed border-hair' : on ? 'bg-green border-border text-white' : 'bg-white border-hair',
                  iso === focusIso ? 'outline outline-[3px] outline-orange -outline-offset-1' : '',
                ].join(' ');
                return (
                  <button key={iso} type="button" disabled={past || beyond} aria-pressed={on} onClick={() => setFocusIso(iso)} className={cls}
                    aria-label={`${month.m0 + 1}月${d}日${on ? '・行ける' : ''}${others.length ? `・${others.length}人` : ''}`}>
                    <span>{d}</span>
                    <span className="flex gap-[2px] pb-1 h-2 items-center">
                      {dots.map((p, j) => (
                        <i key={j} className={`block w-1.5 h-1.5 rounded-full ${p.gender === 'female' ? 'bg-sakura' : 'bg-blue'} ${p.car ? (on ? 'ring-[1.5px] ring-white' : 'ring-[1.5px] ring-border') : ''}`} />
                      ))}
                      {others.length > 4 && <i className="not-italic text-[8px] text-sub leading-none">+{others.length - 4}</i>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-sub font-bold">
            <span><i className="inline-block w-3.5 h-3.5 rounded-full bg-green border-[1.5px] border-border align-[-3px] mr-1" />自分が行ける日</span>
            <span>点＝その日に行ける人（青・ピンク、枠つき＝車）</span>
          </div>
        </div>

        {/* 押した日の「行ける人」 */}
        {fl && (
          <div className="mt-3 border-2 border-border rounded-xl bg-white p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-black mb-1.5">
              <span>{fl.md}（{fl.w}）に行ける人</span>
              <span className="text-[11px] text-sub font-bold">
                {focusOthers.length ? `${focusOthers.length}人${focusOn ? '＋あなた' : ''}` : focusOn ? 'あなただけ' : ''}
              </span>
            </div>
            {listFor(focusIso).length === 0 ? (
              <div className="text-[12px] text-sub font-bold py-1.5">まだ「行ける」を出している人はいません。最初の1人になれます。</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {listFor(focusIso).map((p, j) => <AvailPersonChip key={p.id || j} p={p} />)}
                </div>
                {focusCars.length > 0 && (
                  <div className="text-[11px] text-sub font-bold mt-2">車：{focusCars.length}台（{focusSeats}人まで乗れる）</div>
                )}
              </>
            )}
            {data.needsStation ? (
              <Link href={RETURN_TO} className="block w-full mt-2.5 py-2.5 rounded-xl border-2 border-orange bg-white text-orange text-center text-[14px] font-black">
                最寄り駅を登録すると「行ける」を出せます
              </Link>
            ) : (
              <button type="button" disabled={busy} onClick={() => toggleDay(focusIso)}
                className={`block w-full mt-2.5 py-2.5 rounded-xl border-2 text-center text-[14px] font-black disabled:opacity-60 ${focusOn ? 'border-orange bg-white text-orange' : 'border-border bg-green text-white'}`}>
                {focusOn ? '✓ この日に行ける（押すと取り消し）' : 'この日に行ける'}
              </button>
            )}
          </div>
        )}
        <div className="mt-2"><AvailLegend /></div>
        <div className="text-[11px] text-sub font-bold mt-1.5 leading-relaxed">
          日付を押すと、その日に行ける人がここに出ます。「この日に行ける」を押すとすぐ保存されます。
          {data.canOpenProfiles ? ' 札をタップするとプロフィールが開きます。' : ' 名前とプロフィールは出ません（年齢と、車を出せるかだけ）。'}
        </div>
      </div>
    </div>
  );
}
