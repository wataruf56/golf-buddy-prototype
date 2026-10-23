'use client';

import { useEffect, useRef, useState } from 'react';
import { NoteEditor, noteWhen, useProfileNote } from './ProfileNote';

// DM 画面の右上の「📝 メモ」（2026-10-23 本人指定）。押すと右上からポンと吹き出しが出て、
// DM を見ながら、その相手の「自分だけのメモ」（プロフィールと同じもの）を読んだり直したりできる。
// 吹き出しの外（トーク）はそのまま見られる・スクロールできる（暗い幕は敷かない）。閉じるときに直しかけなら自動で保存。
// 置き場所：DM ヘッダー（position: sticky）の中。吹き出しはヘッダーの下に absolute で重ねる。
export function DmNoteButton({ userId, name }: { userId: string; name: string }) {
  const note = useProfileNote(userId);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const close = async () => {
    if (note.dirty) { const ok = await note.save({ quiet: true }); if (!ok) return; }
    setClosing(true);
    timer.current = setTimeout(() => { setOpen(false); setClosing(false); }, 170);
  };
  const toggle = () => { if (open) close(); else { setClosing(false); setOpen(true); } };
  const has = !!note.saved.trim();
  const when = noteWhen(note.updatedAt);

  return (
    <>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={`${name}さんについての自分だけのメモ`}
        className={`relative flex-shrink-0 px-2.5 py-1.5 rounded-full border-[1.5px] text-[11px] font-black transition-colors ${open ? 'bg-[#FFF6D9] border-[#E9CF7A] text-[#7A5B00]' : 'bg-bg border-border text-sub'}`}>
        📝 メモ
        {has && !open && <span aria-hidden className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange border-2 border-card" />}
      </button>
      {open && (
        <div role="dialog" aria-label="自分だけのメモ"
          className={`absolute right-3 top-full mt-2 z-30 w-[min(340px,calc(100vw-24px))] origin-top-right ${closing ? 'animate-notePopOut' : 'animate-notePop'}`}>
          {/* 吹き出しのしっぽ（メモボタンの下へ） */}
          <span aria-hidden className="absolute -top-[7px] right-6 w-3.5 h-3.5 rotate-45 bg-card border-l-[2px] border-t-[2px] border-border" />
          <div className="relative bg-card rounded-[18px] border-[2px] border-border shadow-[4px_4px_0_#1E3A30] p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[13px] font-black">📝 {name}さんのメモ{when && <span className="ml-1.5 text-[10px] font-normal text-muted">{when} 更新</span>}</div>
              <button type="button" onClick={close} aria-label="閉じる" className="w-7 h-7 -mr-1 rounded-full bg-bg border border-border text-sub text-[13px] leading-none flex items-center justify-center">✕</button>
            </div>
            <NoteEditor note={note} name={name} rows={4} autoFocus={!has} />
          </div>
        </div>
      )}
    </>
  );
}
