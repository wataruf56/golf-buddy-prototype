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
//
// 【同時開催（2026-08-31）】
// 枠が同時に何本も走るようになったので、カードは**枠の本数だけ**並べる。
// ただし**ポップアップは1つだけ**にする。開いた瞬間に2枚重なると、
// どちらを閉じたのか分からなくなり、両方とも読まずに消される。
// 「あとで」は枠ごとに覚える（別の枠の「あとで」を引きずらない）。
const SNOOZE_KEY = 'gb_official_snooze';

type Prompt = { show: boolean; id?: string; title?: string; body?: string; pattern?: 'women' | 'meetup';
  left?: number; total?: number; snoozeDays?: number };
type Mine = { id: string; title: string; stage: string; taken: number; total: number;
  pattern?: 'women' | 'meetup' };

export function OfficialHomeCard() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [popupId, setPopupId] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/official/settings?for=home', { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).catch(() => null),
          fetch('/api/official', { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).catch(() => null),
        ]);
        if (dead) return;

        // 参加中の枠は全部出す。ここがチャットへの戻り道なので、隠してはいけない。
        const joined: Mine[] = (b?.threads || [])
          .filter((t: any) => t?.joined)
          .map((t: any) => ({ id: t.id, title: t.title, stage: t.official?.stage,
            pattern: t.official?.pattern, taken: t.taken, total: t.total }));
        setMine(joined);

        // 声かけ。prompts が本体、無い場合は同時開催より前の形（top-level）で受ける。
        const list: Prompt[] = a?.prompts ? a.prompts : (a?.show ? [a] : []);
        setPrompts(list);

        // ポップアップは「まだ あとで を押していない枠」の先頭1つだけ。
        const first = list.find((x) => x.id && !snoozed(x.id));
        if (first?.id) setPopupId(first.id);
      } catch { /* 出せなくてもホームは動く */ }
    })();
    return () => { dead = true; };
  }, []);

  const popup = prompts.find((x) => x.id === popupId) || null;

  function snooze(p: Prompt | null) {
    const days = p?.snoozeDays ?? 7;
    try {
      // 枠ごとに覚える。1つの枠を「あとで」にしても、別の枠の声かけは残す。
      const raw = localStorage.getItem(SNOOZE_KEY);
      const cur = raw ? JSON.parse(raw) : null;
      const map = (cur && typeof cur === 'object' && cur.v === 2) ? cur : { v: 2, until: {} as Record<string, number> };
      if (p?.id) map.until[p.id] = Date.now() + days * 86400000;
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
    } catch { /* noop */ }
    setPopupId(null);
  }

  if (!mine.length && !prompts.length) return null;

  return (
    <>
      {/* 参加中の枠（戻り道）。本数ぶん並べる */}
      {mine.map((m) => {
        const deciding = m.stage === 'deciding';
        const warm = m.pattern === 'women' ? 'bg-sakura-light border-sakura' : 'bg-orange-light border-orange';
        return (
          <div key={m.id} className="px-5 pb-3">
            <button onClick={() => router.push(deciding ? `/round/${m.id}/decide` : `/round/${m.id}`)}
              className={'block w-full text-left border-2 rounded-card p-4 ' +
                (deciding ? warm : 'bg-card border-border shadow-card')}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{deciding ? '📝' : '⏳'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black">{deciding ? '決めることが残っています' : '仲間を待っています'}</div>
                  <div className="text-[11px] text-sub font-bold mt-0.5 truncate">
                    {deciding
                      ? `「${m.title}」・ゴルフ場と日時を決めましょう`
                      : `「${m.title}」・あと${Math.max(0, m.total - m.taken)}人`}
                  </div>
                </div>
                <span className="text-muted">›</span>
              </div>
            </button>
          </div>
        );
      })}

      {/* 声かけのカード。ポップアップを閉じてもここから戻れる */}
      {prompts.map((p) => {
        const c = colorOf(p.pattern);
        return (
          <div key={p.id} className="px-5 pb-3">
            <button onClick={() => router.push(`/round/${p.id}`)}
              className={'block w-full text-left border-2 rounded-card p-4 ' + c.soft}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{c.face}</span>
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
        );
      })}

      {popup && (
        <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5" onClick={() => snooze(popup)}>
          <div className="bg-card border-[3px] border-border rounded-card shadow-lg p-5 w-full max-w-[330px]"
            onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-[34px] leading-none">{colorOf(popup.pattern).face}</div>
            <div className="text-[18px] font-black text-center mt-2 leading-snug">{popup.title}</div>
            <div className="text-[12.5px] font-bold text-sub text-center mt-2 leading-relaxed whitespace-pre-wrap">{popup.body}</div>
            <div className="bg-white border-2 border-border rounded-xl p-3 mt-3.5 text-[12.5px] font-black text-center leading-relaxed">
              運営が枠だけ用意しています<br />
              <span className={colorOf(popup.pattern).ink}>あと{popup.left}人</span>
              <span className="font-bold text-sub">（{popup.total}人集まったら始まります）</span>
            </div>
            <button onClick={() => { const id = popup.id; setPopupId(null); router.push(`/round/${id}`); }}
              className={'w-full mt-3.5 py-3.5 rounded-xl text-[15px] font-black border-2 text-white ' + colorOf(popup.pattern).btn}>
              くわしく見る
            </button>
            <button onClick={() => snooze(popup)}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted">
              あとで
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// 女性だけの枠は桜色、駅に集まる枠は朱色。詳細画面と同じ色で出して、
// 「さっき見たあれだ」と分かるようにする。
function colorOf(pattern?: 'women' | 'meetup') {
  return pattern === 'women'
    ? { face: '🌸', soft: 'bg-sakura-light border-sakura', ink: 'text-sakura', btn: 'bg-sakura border-sakura' }
    : { face: '📣', soft: 'bg-orange-light border-orange', ink: 'text-orange', btn: 'bg-orange border-orange' };
}

/** この枠の「あとで」がまだ効いているか。枠ごとに覚える。 */
function snoozed(id: string): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    // 同時開催より前の形（{id, until} の1件だけ）も読めるようにしておく
    if (v?.v !== 2) return v?.id === id && Number(v?.until || 0) > Date.now();
    return Number(v?.until?.[id] || 0) > Date.now();
  } catch { return false; }
}
