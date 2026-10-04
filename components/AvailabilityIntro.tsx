'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvailPersonChip } from '@/components/AvailPersonChip';
import { getMe, useStore } from '@/lib/store';
import { AVAIL_ROOM_MIN, type AvailPerson } from '@/lib/availabilityShared';

// 「行ける日」の使い方を、ホームで1回だけ見せるポップアップ（モックA案・2026-10-04 本人判断）。
//   ・20〜30代の会員全員に1回（押した人・押していない人を問わず）
//   ・「あとで」は無い。3枚を「次へ」でめくり、最後まで読んでから閉じる
//   ・見終わったことはサーバーに記録する（別の端末でも出し直さない）。途中で閉じた（アプリを落とした）
//     場合は記録しないので、次に開いたときにもう一度出る＝必ず最後まで目を通してもらう
//   ・最寄り駅が未登録の人は、最後のボタンが「最寄り駅を登録する」になる
const SAMPLE: AvailPerson[] = [
  { age: 31, gender: 'male', car: true },
  { age: 26, gender: 'female', car: false },
  { age: 29, gender: 'male', car: false },
];

export function AvailabilityIntro({ needsStation, onDone }: { needsStation: boolean; onDone: () => void }) {
  const router = useRouter();
  const me = useStore(getMe);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const mePerson: AvailPerson = { age: me.age || 30, gender: me.gender === 'female' ? 'female' : 'male', car: me.car === 'have', me: true, id: me.id, name: 'あなた', avatar: me.avatar, avatarUrl: me.avatarUrl, avatarMode: me.avatarMode, color: me.color, golmotiType: me.golmotiType };

  async function finish(go: 'calendar' | 'station' | 'close') {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/availability/intro-seen', { method: 'POST', credentials: 'include', cache: 'no-store' });
    } catch { /* 記録できなくても閉じる（次回また出るだけ） */ }
    setBusy(false);
    onDone();
    if (go === 'calendar') router.push('/availability');
    if (go === 'station') router.push('/mypage/edit?returnTo=' + encodeURIComponent('/availability'));
  }

  const pages = [
    {
      title: '同じ日に行ける人と、つながる',
      body: '「いつ行けるか」を先に出しておくと、予定が合う人が見つかります。使い方は3つだけです。',
      hero: (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {SAMPLE.map((p, i) => <AvailPersonChip key={i} p={p} />)}
          <AvailPersonChip p={mePerson} />
        </div>
      ),
    },
    {
      title: '最寄り駅を登録して、カレンダーで「行ける日」を押す',
      body: '最寄り駅は集合駅や乗り合いを決めるために使います（ほかの会員には見えません）。行ける日は何日でも。押した日は、同年代の会員に年齢と車の有無だけが出ます。',
      hero: (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="border-2 border-border rounded-xl px-3 py-2 bg-card text-[13px] font-black leading-tight">
            🚉 新宿駅<span className="block text-[10px] text-sub font-bold">運営だけが見ます</span>
          </div>
          <span className="text-sub text-lg">→</span>
          <div className="grid grid-cols-7 gap-[3px]">
            {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((d) => (
              <span key={d} className={`w-[26px] h-[26px] rounded-[7px] border-[1.5px] grid place-items-center text-[11px] font-mono font-extrabold ${d === 7 || d === 14 ? 'bg-green border-border text-white' : 'bg-card border-hair'}`}>{d}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: `同じ日に${AVAIL_ROOM_MIN}人集まると、チャットが始まる`,
      body: 'その日のメンバーだけで、コースや集合場所を相談できます。5人目からは自動で合流。行けなくなったら、その日を外すだけです。',
      hero: (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {SAMPLE.map((p, i) => <AvailPersonChip key={i} p={p} />)}
            <AvailPersonChip p={mePerson} />
          </div>
          <span className="text-sub">↓</span>
          <div className="border-2 border-border rounded-xl bg-green-light px-3 py-2 text-[12px] font-black">💬 10/7（水）のチャットが始まりました</div>
        </div>
      ),
    },
  ];
  const last = page === pages.length - 1;
  const p = pages[page];

  return (
    // 画面の中央に出し、縦が足りない端末では中身がスクロールする。ボタンは下に貼り付けて常に見える
    // （下寄せ＋固定高さだと、LINE内ブラウザやタブバーの下に「次へ」が隠れた：2026-10-04 本人報告）。
    <div className="fixed inset-0 z-[300] bg-text/55 flex items-center justify-center p-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      role="dialog" aria-modal="true" aria-labelledby="avail-intro-title">
      <div className="w-full max-w-[400px] bg-card border-[3px] border-border rounded-2xl shadow-lg flex flex-col overflow-hidden" style={{ maxHeight: 'min(84dvh, 84vh)' }}>
        <div className="overflow-y-auto px-4 pt-4 pb-1">
          <div className="text-[11px] font-black text-green tracking-wide">新しい機能 {page + 1}/{pages.length}</div>
          <h2 id="avail-intro-title" className="text-[17px] font-black leading-snug mt-0.5 mb-1">{p.title}</h2>
          <p className="text-[12px] text-sub font-bold leading-relaxed m-0">{p.body}</p>
          <div className="mt-2.5 border-2 border-border rounded-xl bg-white p-2.5 min-h-[88px] flex items-center justify-center">{p.hero}</div>
          <div className="flex justify-center gap-1.5 mt-2 mb-1" aria-hidden>
            {pages.map((_, i) => <i key={i} className={`block h-2 rounded-full ${i === page ? 'w-[22px] bg-green' : 'w-2 bg-hair'}`} />)}
          </div>
        </div>
        <div className="px-4 pb-3 pt-1 bg-card border-t border-hair flex-shrink-0">
          {!last ? (
            <button type="button" onClick={() => setPage(page + 1)}
              className="block w-full py-3 rounded-xl border-2 border-border bg-green text-white text-[15px] font-black">次へ</button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => finish(needsStation ? 'station' : 'calendar')}
                className="block w-full py-3 rounded-xl border-2 border-border bg-green text-white text-[15px] font-black disabled:opacity-60">
                {needsStation ? '最寄り駅を登録する' : 'カレンダーを開く'}
              </button>
              <button type="button" disabled={busy} onClick={() => finish('close')}
                className="block w-full mt-1 py-1.5 text-[12px] font-bold text-sub">閉じる</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
