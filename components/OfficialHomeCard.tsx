'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// ホームに出す公式スレッド（運営が代理で立てた枠）の導線。3つの顔がある。
//
//   1. まだ入っていない対象の人 … ポップアップで声をかける（「あとで」で数日消える）
//   2. 声をかけたあと          … 一覧に残るカード。ポップアップを閉じても戻ってこられる
//   3. すでに入っている人      … 「決めることが残っています」。ここが戻り道になる
//
// アプリを閉じてもチャットに戻れるように、参加中の人には必ずカードを出す。
const SNOOZE_KEY = 'gb_official_snooze';

type Prompt = { show: boolean; id?: string; title?: string; body?: string; pattern?: 'women' | 'meetup';
  left?: number; total?: number; snoozeDays?: number };
type Mine = { id: string; title: string; stage: string; taken: number; total: number;
  pattern?: 'women' | 'meetup' } | null;

export function OfficialHomeCard() {
  const router = useRouter();
  const [p, setP] = useState<Prompt | null>(null);
  const [mine, setMine] = useState<Mine>(null);
  const [popup, setPopup] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/official/settings?for=home', { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).catch(() => null),
          fetch('/api/official', { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).catch(() => null),
        ]);
        if (dead) return;
        const t = b?.thread;
        if (t?.joined) {
          setMine({ id: t.id, title: t.title, stage: t.official?.stage, pattern: t.official?.pattern,
            taken: t.taken, total: t.total });
          return; // 参加済みの人に声かけは出さない
        }
        if (a?.show) {
          setP(a);
          if (!snoozed(a.id)) setPopup(true);
        }
      } catch { /* 出せなくてもホームは動く */ }
    })();
    return () => { dead = true; };
  }, []);

  function snooze() {
    const days = p?.snoozeDays ?? 7;
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify({ id: p?.id, until: Date.now() + days * 86400000 }));
    } catch { /* noop */ }
    setPopup(false);
  }

  // 参加済み：戻り道
  if (mine) {
    const deciding = mine.stage === 'deciding';
    const warm = mine.pattern === 'women' ? 'bg-sakura-light border-sakura' : 'bg-orange-light border-orange';
    return (
      <div className="px-5 pb-3">
        <button onClick={() => router.push(deciding ? `/round/${mine.id}/decide` : `/round/${mine.id}`)}
          className={'block w-full text-left border-2 rounded-card p-4 ' +
            (deciding ? warm : 'bg-card border-border shadow-card')}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{deciding ? '📝' : '⏳'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black">{deciding ? '決めることが残っています' : '仲間を待っています'}</div>
              <div className="text-[11px] text-sub font-bold mt-0.5 truncate">
                {deciding
                  ? 'ゴルフ場・日時・参加費を決めましょう'
                  : `「${mine.title}」・あと${Math.max(0, mine.total - mine.taken)}人`}
              </div>
            </div>
            <span className="text-muted">›</span>
          </div>
        </button>
      </div>
    );
  }

  if (!p?.show) return null;

  // 女性だけの枠は桜色、駅に集まる枠は朱色。詳細画面と同じ色で出して、
  // 「さっき見たあれだ」と分かるようにする。
  const women = p.pattern === 'women';
  const face = women ? '🌸' : '📣';
  const c = women
    ? { soft: 'bg-sakura-light border-sakura', ink: 'text-sakura', btn: 'bg-sakura border-sakura' }
    : { soft: 'bg-orange-light border-orange', ink: 'text-orange', btn: 'bg-orange border-orange' };

  return (
    <>
      <div className="px-5 pb-3">
        <button onClick={() => router.push(`/round/${p.id}`)}
          className={'block w-full text-left border-2 rounded-card p-4 ' + c.soft}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{face}</span>
            <div className="flex-1 min-w-0">
              <div className={'text-sm font-black ' + c.ink}>{p.title}</div>
              <div className="text-[11px] text-sub font-bold mt-0.5">
                運営が立てた枠・あと{p.left}人
              </div>
            </div>
            <span className={c.ink}>›</span>
          </div>
        </button>
      </div>

      {popup && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5" onClick={snooze}>
          <div className="bg-card border-[3px] border-border rounded-card shadow-lg p-5 w-full max-w-[330px]"
            onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-[34px] leading-none">{face}</div>
            <div className="text-[18px] font-black text-center mt-2 leading-snug">{p.title}</div>
            <div className="text-[12.5px] font-bold text-sub text-center mt-2 leading-relaxed whitespace-pre-wrap">{p.body}</div>
            <div className="bg-white border-2 border-border rounded-xl p-3 mt-3.5 text-[12.5px] font-black text-center leading-relaxed">
              運営が枠だけ用意しています<br />
              <span className={c.ink}>あと{p.left}人</span>
              <span className="font-bold text-sub">（{p.total}人集まったら始まります）</span>
            </div>
            <button onClick={() => { setPopup(false); router.push(`/round/${p.id}`); }}
              className={'w-full mt-3.5 py-3.5 rounded-xl text-[15px] font-black border-2 text-white ' + c.btn}>
              くわしく見る
            </button>
            <button onClick={snooze}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              あとで
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function snoozed(id?: string): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    // 別のスレッドになったら仕切り直し（前の「あとで」を引きずらない）
    if (v?.id && id && v.id !== id) return false;
    return Number(v?.until || 0) > Date.now();
  } catch { return false; }
}
