'use client';

import { useState } from 'react';
import type { Round } from '@/lib/types';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';

// 主催者から参加者への連絡（注意事項・ルール等）。主催者のみ編集・参加者は閲覧。
// 長文・改行OK。コンペで「当日の集合・進行・表彰の説明」等をまとめて伝えるのに使う。
export function HostNote({ round, isHost }: { round: Round; isHost: boolean }) {
  const [note, setNote] = useState(round.hostNote || '');
  const [saving, setSaving] = useState(false);
  const dirty = note !== (round.hostNote || '');

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
    return (
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-black mb-2">📣 主催者からの連絡</div>
        {round.hostNote
          ? <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{round.hostNote}</div>
          : <div className="text-[12px] text-muted py-6 text-center">まだ連絡はありません。</div>}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-black mb-1">📣 主催者からの連絡（参加者に表示）</div>
      <div className="text-[10px] text-muted mb-2">注意事項・集合や進行のルール・持ち物・表彰などを自由に。改行OK。参加者は閲覧のみです。</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={10}
        maxLength={4000}
        placeholder="例）当日は7:45までに練習グリーンへ集合してください。&#10;スロープレー防止にご協力を。&#10;表彰は昼食時に行います。"
        className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y"
      />
      <div className="text-[10px] text-muted text-right mt-1">{note.length}/4000</div>
      <button
        onClick={save}
        disabled={saving || !dirty}
        className="w-full mt-2 py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50"
      >
        {saving ? '保存中…' : dirty ? '保存する' : '保存済み'}
      </button>
    </div>
  );
}
