'use client';

import { REACTIONS } from '@/lib/chatReactions';

// 吹き出しの下のリアクション（付いている数＋選ぶ欄）。グループチャット・DMで共用（2026-10-13）。
// 使い方：吹き出しのタップで open を切り替え、onReact(key) で付ける／外す。
//   reactions … { key: [userId…] }   mine … 自分の userId
export function MessageReactions({ reactions, meId, mine, open, onOpen, onReact }: {
  reactions?: Record<string, string[]>; meId: string; mine: boolean; open: boolean; onOpen: () => void; onReact: (key: string) => void;
}) {
  const rx = reactions || {};
  const used = REACTIONS.filter((r) => (rx[r.key] || []).length > 0);
  if (!used.length && !open) return null;
  return (
    <>
      {(used.length > 0 || !open) && (
        <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
          {used.map((r) => {
            const ids = rx[r.key] || [];
            const on = !!meId && ids.includes(meId);
            return (
              <button key={r.key} type="button" onClick={() => onReact(r.key)} aria-label={`${r.label} ${ids.length}`}
                className={'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] font-bold border-[1.5px] ' + (on ? 'bg-green-light border-green text-green' : 'bg-card border-border text-sub')}>
                <span>{r.emoji}</span><span className="text-[11px]">{ids.length}</span>
              </button>
            );
          })}
          {!open && (
            <button type="button" onClick={onOpen} aria-label="リアクションを付ける"
              className="px-2 py-0.5 rounded-full text-[11px] font-bold border-[1.5px] border-dashed border-border text-muted bg-card">＋</button>
          )}
        </div>
      )}
      {open && (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mt-1`}>
          <div className="inline-flex gap-0.5 bg-card border-[1.5px] border-border rounded-full px-1.5 py-1 shadow-card">
            {REACTIONS.map((r) => {
              const on = !!meId && (rx[r.key] || []).includes(meId);
              return (
                <button key={r.key} type="button" onClick={() => onReact(r.key)} aria-label={r.label}
                  className={'w-8 h-8 rounded-full text-[18px] leading-none grid place-items-center active:scale-90 ' + (on ? 'bg-green-light' : '')}>{r.emoji}</button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
