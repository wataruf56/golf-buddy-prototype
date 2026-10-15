'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';

// 共同主催者を選ぶ（イベント用・2026-10-15）。作成画面（選ぶだけ）と編集画面（押すとすぐ追加／解除）で共通。
// 候補は「招待できる人」と同じ（ゴル友＋同じ組で回った人・同じ年代・/api/me/invite-candidates）。
// 共同主催者は主催者と同じ権限：中身の編集・日程の決定・集計・リマインド、そして自分の都合（候補日・質問）も答えられる。
type Cand = { id: string; displayName: string; avatar: string; avatarUrl?: string; age?: number };

export function CoHostPicker({ selected, onToggle, busy = false, accent = '#7B5CD6', nameOf }: {
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  busy?: boolean;
  accent?: string;
  nameOf?: (id: string) => string | undefined;   // 候補に出ない人（すでに共同主催者の人など）の名前
}) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open || cands) return;
    fetch('/api/me/invite-candidates', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCands(Array.isArray(d?.candidates) ? d.candidates : []))
      .catch(() => setCands([]));
  }, [open, cands]);
  const label = (id: string) => cands?.find((c) => c.id === id)?.displayName || nameOf?.(id) || 'メンバー';
  const list = (cands || []).filter((c) => !q.trim() || c.displayName.includes(q.trim()));

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full" style={{ background: '#EFEAFF' }}>
              <span className="text-[13px] font-bold text-text">🤝 {label(id)}</span>
              <button type="button" disabled={busy} aria-label={`${label(id)}さんを共同主催者から外す`}
                className="w-5 h-5 flex items-center justify-center text-red font-black disabled:opacity-40" onClick={() => onToggle(id, false)}>×</button>
            </span>
          ))}
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 bg-bg rounded-lg text-sm font-bold border border-line" style={{ color: accent }}>
        {open ? '閉じる' : '＋ 共同主催者を選ぶ'}
      </button>
      {open && (
        <div className="mt-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 名前で探す"
            className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none mb-1.5" />
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {cands === null ? (
              <div className="px-3 py-2 text-[11px] text-muted">読み込み中…</div>
            ) : list.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted font-medium leading-relaxed">選べる人がまだいません。ゴル友（QR・友達申請・お互いに「行きたい」）か、同じ組で回ったことがある人を選べます。</div>
            ) : list.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button key={c.id} type="button" disabled={busy} onClick={() => onToggle(c.id, !on)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left disabled:opacity-50" style={{ background: on ? '#EFEAFF' : undefined }}>
                  <Avatar user={{ id: c.id, displayName: c.displayName, avatar: c.avatar, avatarUrl: c.avatarUrl, color: '#2A8C82' } as any} size={28} />
                  <span className="text-sm font-bold text-text flex-1">{c.displayName}{c.age ? <span className="text-[11px] text-muted font-medium ml-1">{c.age}歳</span> : null}</span>
                  {on && <span className="font-black" style={{ color: accent }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-muted font-medium leading-relaxed">
        共同主催者は最初から参加確定で、あなたと同じく中身の編集・日程の決定・集計・リマインドができます。自分の都合（候補日・質問）も答えられます。
      </div>
    </div>
  );
}
