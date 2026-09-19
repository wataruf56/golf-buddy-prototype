'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

/**
 * 追いDMの確認。
 *
 * 【何を解いているか】
 * 返事をしていないのに2通、3通と続けて送ってくる相手がいる（LINEでいう「追いLINE」）。
 * 送られた側は、もう返したくないのかもしれない。でも過去のラウンド後に
 * 「また回りたい」を押したままだと、マッチは続き、再会の誘いも届き続ける。
 * 本人がそれに気づく機会がない。
 *
 * そこで、**追いDMされている側がDMを開いたとき**に一度だけ聞く。
 * 「そのときは『また回りたい』と思ったけど、変えなくて大丈夫？」
 * 変える先は再会画面の「いまの気持ち」（また回りたい／どっちでもいい／ごめんなさい）。
 *
 * 【出す条件】
 *   ・自分の最後の返信のあとに、相手から2通以上続けて届いている（一度も返していなければ全部）
 *   ・その相手とマッチしている（また回りたい／気になる）
 *   ・この「続けて届いている」ひとまとまりに対して、まだ「このままでいい」を押していない
 *     （押したら、次に自分が返してから相手がまた追ってくるまで出さない）
 *
 * 相手には何も知らせない。変更しても通知されない（FeelingBox と同じ）。
 */
type Msg = { id: string; senderId: string; createdAt: number };

const KEY = (chatId: string) => `goltomo:chaseOk:${chatId}`;

export function ChaseCheck({ chatId, meId, otherId, otherName, messages }: {
  chatId: string; meId: string; otherId: string; otherName: string; messages: Msg[];
}) {
  const router = useRouter();

  // 自分の最後の返信より後に、相手が何通続けて送ってきているか。
  // ひとまとまりを識別するために、その先頭のメッセージIDを持つ。
  const streak = useMemo(() => {
    if (!meId || !otherId) return null;
    const sorted = messages.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let n = 0;
    let firstId = '';
    for (let i = sorted.length - 1; i >= 0; i--) {
      const m = sorted[i];
      if (m.senderId === meId) break;
      if (m.senderId !== otherId) continue;
      n++;
      firstId = m.id;
    }
    return n >= 2 ? { n, key: firstId } : null;
  }, [messages, meId, otherId]);

  const [kind, setKind] = useState<'again' | 'romantic' | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOpen(false);
    if (!streak) return;
    // このひとまとまりには、もう「このままでいい」と答えている。
    try { if (localStorage.getItem(KEY(chatId)) === streak.key) return; } catch { /* 見られなくても聞く */ }

    let dead = false;
    fetch(`/api/me/matches?with=${encodeURIComponent(otherId)}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (dead || !d?.match) return;
        const k = d.match.romantic ? 'romantic' : d.match.again ? 'again' : null;
        if (!k) return;       // マッチしていない相手には聞く理由がない
        setKind(k);
        setOpen(true);
      })
      .catch(() => { /* 出せなくてもDMは使える */ });
    return () => { dead = true; };
  }, [streak?.key, chatId, otherId]);

  if (!open || !streak || !kind) return null;
  const label = kind === 'romantic' ? '気になる' : 'また回りたい';

  function keep() {
    try { localStorage.setItem(KEY(chatId), streak!.key); } catch { /* noop */ }
    setOpen(false);
  }

  async function change() {
    setBusy(true);
    try {
      // 再会画面の先頭に「いまの気持ち」がある。そこで選び直してもらう。
      const r = await fetch('/api/rematch/ensure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: otherId }), credentials: 'include', cache: 'no-store',
      });
      const d = await r.json();
      if (!r.ok || !d?.pairId) throw new Error('開けませんでした');
      router.push(`/rematch/${d.pairId}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 z-[150] flex items-center justify-center p-5" onClick={keep}>
      <div className="bg-card rounded-card shadow-card w-full max-w-[360px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-[30px] leading-none">🤔</div>
        <div className="text-[16px] font-black text-center mt-2">ちょっと確認させてください</div>
        <div className="text-[13px] font-bold text-sub mt-3 leading-relaxed">
          過去に一緒にラウンドを回ったときは「{label}」と思っていましたが、
          その後、<b className="text-text">{otherName}さん</b>との「{label}」を変更しなくて大丈夫ですか？
        </div>

        <button onClick={change} disabled={busy}
          className="w-full mt-4 py-3.5 rounded-xl text-[15px] font-black bg-orange text-white disabled:opacity-50">
          {busy ? '開いています…' : '変更する'}
        </button>
        <button onClick={keep} disabled={busy}
          className="w-full mt-2 py-3 rounded-xl text-[14px] font-black bg-card text-sub border-2 border-border">
          このままでいい
        </button>

        <div className="text-[11px] font-bold text-muted text-center mt-3 leading-relaxed">
          変更しても、{otherName}さんには通知されません。
        </div>
      </div>
    </div>
  );
}
