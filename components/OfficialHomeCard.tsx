'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';

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
  left?: number; total?: number; snoozeDays?: number;
  // 管理者の代理ラウンド募集（ドライバー先行）の枠。ワンタップで入ってチャットへ送る。
  proxy?: boolean; stations?: string[];
  /** だいたいの開催時期。無い枠もある（この項目より前に立てたもの）。 */
  when?: { year: number; month: number; half: 'early' | 'late'; days: 'weekday' | 'weekend' | 'any' } | null };
type Mine = { id: string; title: string; stage: string; taken: number; total: number;
  pattern?: 'women' | 'meetup' };

/** 「9月下旬ごろ・土日」。声かけの時点で見せる。
 *  日程は決めない企画だが、平日か土日かだけは先に分からないと手を挙げられない。 */
function whenText(w: Prompt['when']): string {
  if (!w || !w.month) return '';
  const d = w.days === 'weekday' ? '平日' : w.days === 'weekend' ? '土日' : '平日/土日';
  return `${w.month}月${w.half === 'early' ? '上旬' : '下旬'}ごろ・${d}`;
}

export function OfficialHomeCard() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        list.filter((x) => x.proxy).forEach((x) => track('pr_rider_view', { id: x.id }));
        const first = list.find((x) => x.id && !snoozed(x.id));
        if (first?.id) setPopupId(first.id);
      } catch { /* 出せなくてもホームは動く */ }
    })();
    return () => { dead = true; };
  }, []);

  const popup = prompts.find((x) => x.id === popupId) || null;

  /**
   * 「予定が合えば行きたい」。枠を選ばせずに入れて、そのままチャットへ送る。
   * 運営が枠まで用意しているのに、参加する側に席を選ばせると一段増えて手が止まる。
   * 入れる席が決められなかったときだけ、詳細画面に戻して選んでもらう。
   */
  async function joinNow(p: Prompt) {
    if (!p.id || busy) return;
    setBusy(true);
    track('pr_rider_join', { id: p.id });
    try {
      const r = await fetch('/api/proxy-recruit/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: p.id }), credentials: 'include',
      });
      const j = await r.json();
      if (!j?.ok) {
        if (j?.needsPick) { router.push(`/round/${p.id}`); return; }
        throw new Error(j?.message || '参加できませんでした');
      }
      setPopupId(null);
      // そろっていればチャットが始まっているのでそちらへ。
      // まだなら募集の画面へ（チャットは人がそろってから始まるので、
      // ここでチャットへ送ると空の部屋に着いてしまう）。
      router.push(j.filled ? `/round/${p.id}/chat` : `/round/${p.id}`);
      if (!j.filled) toast('参加しました。人がそろったらお知らせします');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  function snooze(p: Prompt | null) {
    const days = p?.snoozeDays ?? 7;
    try {
      // 枠ごとに覚える。1つの枠を「あとで」にしても、別の枠の声かけは残す。
      const raw = localStorage.getItem(SNOOZE_KEY);
      const cur = raw ? JSON.parse(raw) : null;
      const map = (cur && typeof cur === 'object' && cur.v === 2) ? cur : { v: 2, until: {} as Record<string, number> };
      if (p?.id) map.until[p.id] = Date.now() + days * 86400000;
      if (p?.proxy) track('pr_rider_later', { id: p.id });
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
                    {p.proxy && p.stations?.length
                      ? `🚉 ${p.stations.slice(0, 3).join('・')}で拾えます・あと${p.left}人`
                      : `運営が立てた枠・あと${p.left}人`}
                  </div>
                  {!!whenText(p.when) && (
                    <div className="text-[11px] font-black mt-0.5">📅 {whenText(p.when)}</div>
                  )}
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
            {!!whenText(popup.when) && (
              <div className="mt-3 text-center">
                <span className="inline-block text-[13px] font-black bg-white border-2 border-border rounded-xl px-3 py-1.5">
                  📅 {whenText(popup.when)}
                </span>
              </div>
            )}
            <div className="bg-white border-2 border-border rounded-xl p-3 mt-3 text-[12.5px] font-black text-center leading-relaxed">
              運営が枠だけ用意しています<br />
              <span className={colorOf(popup.pattern).ink}>あと{popup.left}人</span>
              <span className="font-bold text-sub">（{popup.total}人集まったら始まります）</span>
            </div>
            {popup.proxy ? (
              <>
                <button onClick={() => joinNow(popup)} disabled={busy}
                  className={'w-full mt-3.5 py-3.5 rounded-xl text-[15px] font-black border-2 text-white ' + colorOf(popup.pattern).btn}>
                  {busy ? '参加しています...' : '予定が合えば行きたい'}
                </button>
                <button onClick={() => { const id = popup.id; setPopupId(null); router.push(`/round/${id}`); }}
                  className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-black border-2 border-border bg-white">
                  くわしく見る
                </button>
              </>
            ) : (
              <button onClick={() => { const id = popup.id; setPopupId(null); router.push(`/round/${id}`); }}
                className={'w-full mt-3.5 py-3.5 rounded-xl text-[15px] font-black border-2 text-white ' + colorOf(popup.pattern).btn}>
                くわしく見る
              </button>
            )}
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
