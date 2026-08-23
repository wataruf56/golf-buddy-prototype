'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';

// DMが送れない相手のプロフィールに出す「友達申請」ボタンと、その入力フォーム。
//
// 【グレーアウトのタイミング】
// ラジオで「どちらでもない」を選んだだけでは何も起きない（選び直しも自由）。
// **送信ボタンを押して初めて**「申請できません」と出てグレーアウトし、
// その相手への申請が24時間ロックされる。
type Claim = 'same_group' | 'competition' | 'none';

const OPTIONS: Array<{ key: Claim; label: string; note: string }> = [
  { key: 'same_group', label: '⛳ 同じ組で回った', note: '承認されるとお互いを評価できます' },
  { key: 'competition', label: '🏆 同じコンペにいた', note: '組は別だった' },
  { key: 'none', label: '✋ どちらでもない', note: '面識がない／別の場所で知り合った' },
];

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function FriendRequestButton({ toUserId, toName }: { toUserId: string; toName?: string }) {
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [metAt, setMetAt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [blockedMsg, setBlockedMsg] = useState('');

  const locked = blockedUntil != null;

  async function submit() {
    if (!claim) { toast('どこで一緒だったかを選んでください', 'error'); return; }
    // 日付は必須。「いつ」が無いと受け手が思い出せず、承認の判断ができない。
    if (claim !== 'none' && !metAt) { toast('いつのことか、日付を選んでください', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/friends/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toId: toUserId, claim, metAt, message }), credentials: 'include',
      });
      const j = await r.json();
      if (j?.blocked) {
        setBlockedUntil(j.lockedUntil || Date.now() + 24 * 3600 * 1000);
        setBlockedMsg(j.message || '');
        return;
      }
      if (!r.ok || !j?.ok) throw new Error(j?.message || '送信に失敗しました');
      setSent(true);
      toast('申請を送りました');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="w-full py-3 rounded-xl text-[14px] font-black text-center bg-yellow-light border-2 border-yellow">
        ⏳ 申請中 — 返事を待っています
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3.5 bg-green text-white rounded-xl text-[15px] font-black border-2 border-border"
      >🤝 友達申請を送る</button>
    );
  }

  return (
    <div className="bg-card border-2 border-border rounded-card shadow-card p-4">
      <div className="text-[14px] font-black mb-0.5">{toName ? `${toName}さんに友達申請` : '友達申請'}</div>
      <div className="text-[11px] font-black text-sub mt-3 mb-1.5">どこで一緒でしたか？</div>
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => { setClaim(o.key); setBlockedUntil(null); }}
            disabled={locked}
            className={'w-full text-left border-2 rounded-xl px-3 py-2.5 ' +
              (claim === o.key
                ? (locked && o.key === 'none' ? 'bg-red-light border-red' : 'bg-green-light border-green')
                : 'bg-white border-border')}
          >
            <div className="text-[13px] font-black">{o.label}</div>
            <div className="text-[11px] font-bold text-sub mt-0.5">{o.note}</div>
          </button>
        ))}
      </div>

      {locked ? (
        <>
          <div className="mt-3 bg-red-light border-2 border-red rounded-xl p-3">
            <div className="text-[13px] font-black text-red">⛔ 友達申請はできません</div>
            <div className="text-[11.5px] font-bold text-sub mt-1 leading-relaxed">{blockedMsg}</div>
          </div>
          <button disabled className="w-full mt-3 py-3 rounded-xl text-[15px] font-black border-2 border-muted bg-[#EDEDED] text-[#A9A9A9]">
            申請を送る
          </button>
          <div className="text-[12px] font-black text-red text-center mt-2">
            ⏳ 24時間後にまた申請できます
          </div>
        </>
      ) : (
        <>
          {claim !== 'none' && (
            <>
              <div className="text-[11px] font-black text-sub mt-3 mb-1.5">いつのことですか？</div>
              <input
                type="date" value={metAt} max={todayJst()}
                onChange={(e) => setMetAt(e.target.value)}
                className="w-full border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-bold bg-white"
              />
              <div className="text-[11px] font-black text-sub mt-3 mb-1.5">ひとこと（任意）</div>
              <input
                type="text" value={message} maxLength={100}
                placeholder="〇〇コンペでご一緒しました！"
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-bold bg-white"
              />
            </>
          )}
          <button
            disabled={busy} onClick={submit}
            className="w-full mt-3 py-3 rounded-xl text-[15px] font-black border-2 bg-green text-white border-green"
          >{busy ? '送信中...' : '申請を送る'}</button>
          <button
            onClick={() => setOpen(false)}
            className="w-full mt-2 py-2 rounded-xl text-[12px] font-bold border-2 border-hair bg-white text-muted"
          >やめる</button>
        </>
      )}
    </div>
  );
}
