'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Round } from '@/lib/types';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Linkify } from '@/components/Linkify';

// 主催者からのメッセージ（注意事項・ルール等）。主催者のみ編集・参加者は閲覧。
// 2026-10-08：募集ページでは1行のカード（集合場所の下）だけにして、押すと別ページ（/round/[id]/message）で全文を読む。
//   参加者 … メッセージがあるときだけ「📣 主催者からのメッセージ［メッセージあり］›」
//   主催者 … 常に出す（未記入なら「書く」）。別ページで編集。
export function HostNoteCard({ round, isHost }: { round: Round; isHost: boolean }) {
  const has = !!(round.hostNote || '').trim();
  if (!isHost && !has) return null;
  return (
    <Link href={`/round/${round.id}/message`} className="mb-4 flex items-center gap-2 bg-card rounded-xl border-[1.5px] border-border px-3 py-2.5">
      <span className="text-[11px] font-black text-orange flex-1 min-w-0">📣 主催者からのメッセージ</span>
      {has
        ? <span className="text-[10px] font-black px-2 py-[2px] rounded-full bg-orange-light text-orange border border-orange flex-shrink-0">メッセージあり</span>
        : <span className="text-[10px] font-bold text-muted flex-shrink-0">未記入（押して書く）</span>}
      <span className="text-[14px] text-sub font-black flex-shrink-0">›</span>
    </Link>
  );
}

// 別ページの本体。参加者は読むだけ、主催者は編集。
export function HostNote({ round, isHost }: { round: Round; isHost: boolean }) {
  const saved = round.hostNote || '';
  const [note, setNote] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(saved); }, [saved]);
  const dirty = note !== saved;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/host-note`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }), cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      await store.refreshRounds();
      toast('保存しました');
    } catch (e) { toast('保存失敗: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  if (!isHost) {
    return saved.trim()
      ? <div className="bg-card rounded-xl border-[1.5px] border-border p-4 text-[12.5px] leading-[1.8] whitespace-pre-wrap break-words"><Linkify text={saved} /></div>
      : <div className="text-[12px] text-muted py-10 text-center">まだメッセージはありません。</div>;
  }
  return (
    <div>
      <div className="text-[11px] text-muted mb-2 leading-relaxed">注意事項・集合や進行のルール・持ち物・表彰などを自由に。改行OK。参加者には募集ページに「メッセージあり」と出て、押すとこのページで読めます。</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={14}
        maxLength={4000}
        placeholder="例）当日は7:45までに練習グリーンへ集合してください。&#10;スロープレー防止にご協力を。&#10;表彰は昼食時に行います。"
        className="w-full text-[12.5px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y"
      />
      <div className="text-[10px] text-muted text-right mt-1">{note.length}/4000</div>
      <button onClick={save} disabled={saving || !dirty} className="w-full mt-2 py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
        {saving ? '保存中…' : dirty ? '保存する' : '保存済み'}
      </button>
    </div>
  );
}
