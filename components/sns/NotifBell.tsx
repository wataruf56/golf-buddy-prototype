'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { store, useStore, getMe } from '@/lib/store';
import { agoLabel } from '@/components/sns/SnsParts';

// テスト版ホーム右上の 🔔（2026-11-02 本人指定）。今までのお知らせ（store.notifications）をそのまま読む。
// DM の「📝 メモ」（components/DmNoteButton）と同じ形：右上から吹き出しが出て、画面は移らない。暗い幕も敷かず、外の画面はそのまま動かせる。
// 置き場所：ヘッダー（position: sticky）の中。吹き出しはヘッダーの下に absolute で重ねる。
export function NotifBell() {
  const router = useRouter();
  const notifications = useStore((s) => s.notifications);
  const me = useStore(getMe);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [readAt, setReadAt] = useState(0);   // 開いたときの既読時刻（開いている間は、新しい分の色を残す）
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const unread = notifications.filter((n) => n.createdAt > (me.notifReadAt || 0)).length;

  const close = () => {
    setClosing(true);
    timer.current = setTimeout(() => { setOpen(false); setClosing(false); }, 170);
  };
  const toggle = () => {
    if (open) { close(); return; }
    setReadAt(me.notifReadAt || 0);
    setClosing(false);
    setOpen(true);
    if (unread > 0) store.markNotificationsRead();   // 今のホームで見たときと同じ、本人の既読の記録だけ
  };

  return (
    <>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label="お知らせ" className="relative leading-none">
        🔔
        {unread > 0 && !open && <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-red text-white text-[10px] font-black flex items-center justify-center border-2 border-card">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="お知らせ"
          className={`absolute right-3 top-full mt-2 z-30 w-[min(340px,calc(100vw-24px))] origin-top-right ${closing ? 'animate-notePopOut' : 'animate-notePop'}`}>
          <span aria-hidden className="absolute -top-[7px] right-[5px] w-3.5 h-3.5 rotate-45 bg-card border-l-[2px] border-t-[2px] border-border" />
          <div className="relative bg-card rounded-[18px] border-[2px] border-border shadow-[4px_4px_0_#1E3A30] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-hair">
              <div className="text-[13px] font-black">🔔 お知らせ</div>
              <button type="button" onClick={close} aria-label="閉じる" className="w-7 h-7 -mr-1 rounded-full bg-bg border border-border text-sub text-[13px] leading-none flex items-center justify-center">✕</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              {notifications.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-muted">お知らせはまだありません</div>}
              {notifications.map((n) => {
                const isNew = n.createdAt > readAt;
                const body = (
                  <div className={`flex items-start gap-2 px-3.5 py-2.5 border-b border-hair text-left ${isNew ? 'bg-green-light/40' : ''}`}>
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isNew ? 'bg-green' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12.5px] leading-snug ${isNew ? 'font-bold text-text' : 'text-sub'}`}>{n.text}</div>
                      <div className="text-[10px] text-muted mt-0.5">{agoLabel(n.createdAt)}</div>
                    </div>
                    {n.link && <span className="text-muted text-sm">›</span>}
                  </div>
                );
                return n.link
                  ? <button key={n.id} type="button" onClick={() => { setOpen(false); router.push(n.link!); }} className="block w-full">{body}</button>
                  : <div key={n.id}>{body}</div>;
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
