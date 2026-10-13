'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { VerdictPicker, oppositeForUi } from '@/components/DirectReviewCard';
import { chatIdFor } from '@/lib/utils';
import type { ReviewVerdict } from '@/lib/types';

// 届いた友達申請に答えるカード（2026-10-13〜）。
//   1. 「〇〇さんは『… に同じ組で回った』と言っています。合っていますか？」→ 3択
//        ⛳ 同じ組でした        → その場で評価（必須）→ 友達になる／ならない
//        🏆 コンペで一緒だっただけ → 友達になる／ならない（評価なし）
//        🤔 心当たりがない      → この申請を閉じる（24時間ロック）
//   2. どれを選んでも申請者には通知しない。申請者の画面は「ならない」でも「返事待ち」のまま。
//   送信後は結果カード（onDone）を親が出す。
export type RespondReq = {
  id: string; fromId: string; claim: 'same_group' | 'competition'; metAt: string; message?: string;
};
export type RespondUser = {
  id: string; displayName?: string; avatar?: string; avatarUrl?: string; color?: string;
  age?: number; area?: string; gender?: string;
};
export type RespondResult = { friend: boolean; closed: boolean; matched: boolean };
type Fact = 'same_group' | 'competition' | 'none';

const fmt = (s: string) => (s || '').replace(/-/g, '/');

export function FriendRequestRespondCard({
  req, user, meGender, onDone,
}: {
  req: RespondReq;
  user: RespondUser;
  meGender?: string;
  onDone: (result: RespondResult) => void;
}) {
  const [fact, setFact] = useState<Fact | null>(null);
  const [verdict, setVerdict] = useState<ReviewVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const name = user.displayName || 'ゴルファー';
  const opposite = oppositeForUi(meGender, user.gender);

  function chooseFact(f: Fact) {
    setFact(f);
    // 事実を選び直したら評価もやり直し（別の事実で答えた評価を持ち越さない）
    if (f !== 'same_group') setVerdict(null);
  }

  async function submit(friend: boolean) {
    if (!fact) return;
    if (fact === 'same_group' && !verdict) { toast('先に評価を選んでください', 'error'); return; }
    setBusy(true);
    try {
      const body = fact === 'none'
        ? { result: 'none' }
        : { result: fact, friend, ...(fact === 'same_group' ? { review: { verdict } } : {}) };
      const r = await fetch(`/api/friends/requests/${req.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || '失敗しました');
      if (j?.already) {
        toast('この申請はすでに閉じられています');
        onDone({ friend: false, closed: true, matched: false });
        return;
      }
      onDone({ friend: fact !== 'none' && friend, closed: fact === 'none' || !friend, matched: !!j?.matched });
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  // 「友達になりますか？」を出せる状態か
  const readyForFriend = fact === 'competition' || (fact === 'same_group' && !!verdict);

  return (
    <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
      <Link href={`/profile/${req.fromId}`} className="flex items-center gap-3">
        <Avatar user={user as any} size={44} emojiSize={22} />
        <div>
          <div className="text-[15px] font-black">{name}</div>
          <div className="text-[11.5px] text-sub">{[user.age ? `${user.age}歳` : '', user.area].filter(Boolean).join('・')}</div>
        </div>
      </Link>
      {req.message && (
        <div className="mt-2.5 border-2 border-dashed border-border rounded-xl p-2.5 text-[12.5px] font-bold">
          「{req.message}」
        </div>
      )}
      <div className="mt-3 text-[13px] font-black leading-relaxed">
        {name}さんは<br />
        <span className="text-orange">「{fmt(req.metAt)} に{req.claim === 'same_group' ? '同じ組で回った' : '同じコンペにいた'}」</span>と言っています。
      </div>
      <div className="text-[11px] font-black text-sub mt-3 mb-1.5">合っていますか？</div>
      <div className="space-y-2">
        {([
          ['same_group', '⛳ はい、同じ組でした', '評価してから、友達になるかを選べます'],
          ['competition', '🏆 コンペで一緒だっただけ', '評価はしません。友達になるかを選べます'],
          ['none', '🤔 心当たりがない', '友達には追加しません'],
        ] as Array<[Fact, string, string]>).map(([k, label, note]) => (
          <button
            key={k} type="button" disabled={busy} onClick={() => chooseFact(k)}
            className={'w-full text-left border-2 rounded-xl px-3 py-2.5 ' +
              (fact === k ? 'bg-green-light border-green' : 'bg-white border-border')}
          >
            <div className="text-[13px] font-black">{label}</div>
            <div className="text-[11px] font-bold text-sub mt-0.5">{note}</div>
          </button>
        ))}
      </div>

      {/* 同じ組 → まず評価（必須） */}
      {fact === 'same_group' && (
        <div className="mt-3 border-2 border-border rounded-xl p-3 bg-[#FFFDF5]">
          <div className="text-[11px] font-black text-sub mb-1">① {name}さんを評価してください</div>
          <VerdictPicker value={verdict} onChange={setVerdict} opposite={opposite} />
          <div className="text-[10.5px] font-bold text-muted text-center mt-1.5">あなたが選んだものは相手には伝わりません</div>
        </div>
      )}

      {/* 友達になる／ならない */}
      {readyForFriend && (
        <div className="mt-3 border-2 border-border rounded-xl p-3">
          <div className="text-[13px] font-black text-center">
            {fact === 'same_group' ? '② ' : ''}{name}さんと友達になりますか？
          </div>
          <div className="text-[11px] font-bold text-sub leading-relaxed mt-1.5 bg-bg rounded-lg px-2.5 py-2">
            友達になると…<br />
            ・お互いにメッセージ（DM）を送れます<br />
            ・ゴル友の一覧に出て、行ける日に🤝の印が付きます
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              type="button" disabled={busy} onClick={() => submit(true)}
              className="flex-[3] py-3 rounded-xl text-[15px] font-black border-2 bg-green text-white border-green"
            >{busy ? '送信中...' : '🤝 友達になる'}</button>
            <button
              type="button" disabled={busy} onClick={() => submit(false)}
              className="flex-[2] py-3 rounded-xl text-[14px] font-black border-2 bg-white text-sub border-border"
            >ならない</button>
          </div>
        </div>
      )}

      {/* 心当たりがない → 閉じる */}
      {fact === 'none' && (
        <div className="mt-3">
          <button
            type="button" disabled={busy} onClick={() => submit(false)}
            className="w-full py-3 rounded-xl text-[15px] font-black border-2 bg-white text-text border-border"
          >{busy ? '送信中...' : 'この申請を閉じる'}</button>
          <div className="text-[11px] font-bold text-sub text-center mt-1.5 leading-relaxed">
            閉じても{name}さんには通知されません。<br />24時間は{name}さんから申請が届かなくなります。
          </div>
        </div>
      )}

      {/* いつでも出す：申請者には通知しない */}
      <div className="mt-3 px-2.5 py-2 rounded-xl border-2 border-border bg-[#FFF8E1] text-[11.5px] font-bold leading-relaxed">
        🔒 どちらを選んでも、{name}さんに通知されることはありません。「ならない」を選んでも、{name}さんの画面は「返事待ち」のままです。
      </div>
    </div>
  );
}

/** 答えたあとに出す結果カード。 */
export function FriendRequestResultCard({
  user, meId, result, onClose,
}: {
  user: RespondUser;
  meId?: string;
  result: RespondResult;
  onClose: () => void;
}) {
  const name = user.displayName || 'ゴルファー';
  return (
    <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-3">
        <Avatar user={user as any} size={40} emojiSize={20} />
        <div className="flex-1 min-w-0 text-[13px] font-black leading-relaxed">
          {result.friend
            ? <>🤝 {name}さんと友達になりました。<br /><span className="text-sub text-[11.5px]">{name}さんには通知していません</span></>
            : <>この申請を閉じました。<br /><span className="text-sub text-[11.5px]">{name}さんには通知していません（{name}さんの画面は「返事待ち」のままです）</span></>}
        </div>
      </div>
      {result.friend && result.matched && (
        <div className="mt-2 text-[12px] font-black text-green text-center">🎉 お互いに「行きたい」同士でした</div>
      )}
      <div className="flex gap-2 mt-3">
        {result.friend && meId && (
          <Link
            href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`}
            className="flex-[3] text-center py-2.5 rounded-xl text-[14px] font-black border-2 bg-green text-white border-green"
          >💬 メッセージを送る</Link>
        )}
        <button
          type="button" onClick={onClose}
          className="flex-[2] py-2.5 rounded-xl text-[13px] font-bold border-2 border-hair bg-white text-muted"
        >閉じる</button>
      </div>
    </div>
  );
}
