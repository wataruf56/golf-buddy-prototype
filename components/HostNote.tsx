'use client';

import { useEffect, useState } from 'react';
import type { Round } from '@/lib/types';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Linkify } from '@/components/Linkify';

// 主催者からのメッセージ（注意事項・ルール等）。主催者のみ編集・参加者は閲覧。
// 2026-10-08：タブではなく、募集の詳細カード（集合場所・集合時間の下）に置くアコーディオンに変更。
//   参加者 … メッセージがあるときだけ「📣 主催者からのメッセージ　メッセージあり ▼」。押すと開く／もう一度押すと閉じる。
//   主催者 … 同じ場所に常に出す。開くと編集欄。
// ?tab=hostnote で来た場合は最初から開いておく（以前のタブへのリンク互換）。
export function HostNote({ round, isHost, defaultOpen = false }: { round: Round; isHost: boolean; defaultOpen?: boolean }) {
  const saved = round.hostNote || '';
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(saved); }, [saved]);
  const dirty = note !== saved;

  if (!isHost && !saved.trim()) return null;

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

  const has = !!saved.trim();
  return (
    <div className="mb-4 bg-card rounded-xl border-[1.5px] border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-[11px] font-black text-orange flex-1 min-w-0">📣 主催者からのメッセージ</span>
        {has
          ? <span className="text-[10px] font-black px-2 py-[2px] rounded-full bg-orange-light text-orange border border-orange flex-shrink-0">メッセージあり</span>
          : <span className="text-[10px] font-bold text-muted flex-shrink-0">未記入（参加者には出ません）</span>}
        <span className={'text-[11px] text-sub transition-transform flex-shrink-0 ' + (open ? 'rotate-180' : '')}>▼</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-border pt-2.5">
          {!isHost ? (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap"><Linkify text={saved} /></div>
          ) : (
            <>
              <div className="text-[10px] text-muted mb-2">注意事項・集合や進行のルール・持ち物・表彰などを自由に。改行OK。参加者には「メッセージあり」と出て、押すと開きます。</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={8}
                maxLength={4000}
                placeholder="例）当日は7:45までに練習グリーンへ集合してください。&#10;スロープレー防止にご協力を。&#10;表彰は昼食時に行います。"
                className="w-full text-[13px] border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg outline-none leading-relaxed resize-y"
              />
              <div className="text-[10px] text-muted text-right mt-1">{note.length}/4000</div>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="w-full mt-2 py-2.5 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {saving ? '保存中…' : dirty ? '保存する' : '保存済み'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
