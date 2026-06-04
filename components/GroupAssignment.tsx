'use client';

import { useMemo, useRef, useState } from 'react';
import type { Round, RoundGroup, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';

const GROUP_MAX = 4;
let uidSeq = 0;
const newGroupId = () => `g_${Date.now()}_${(uidSeq++).toString(36)}`;

export function GroupAssignment({ round, users, isHost }: { round: Round; users: User[]; isHost: boolean }) {
  const participantIds = useMemo(
    () => [round.hostId, ...(round.applicantIds || [])].filter(Boolean),
    [round.hostId, round.applicantIds],
  );
  const userOf = (id: string) => users.find((u) => u.id === id);
  const nameOf = (id: string) => userOf(id)?.displayName || 'メンバー';

  // Build initial groups from the saved data, dropping ids no longer participating.
  const initial: RoundGroup[] = (round.groups || []).map((g) => ({
    id: g.id || newGroupId(),
    startTime: g.startTime,
    memberIds: (g.memberIds || []).filter((id) => participantIds.includes(id)),
  }));
  const [groups, setGroups] = useState<RoundGroup[]>(initial.length ? initial : []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const assigned = new Set(groups.flatMap((g) => g.memberIds));
  const pool = participantIds.filter((id) => !assigned.has(id));
  const needed = Math.ceil(participantIds.length / GROUP_MAX);

  // ---------- read-only view (non-host) ----------
  if (!isHost) {
    if (!groups.length) return null;
    return (
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-bold mb-2">⛳ 組分け・スタート時間</div>
        <div className="flex flex-col gap-2">
          {groups.map((g, gi) => (
            <div key={g.id} className="bg-bg rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold">組{gi + 1}</span>
                <span className="text-[12px] font-bold text-green">{g.startTime || '時間未定'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.memberIds.map((id) => {
                  const u = userOf(id);
                  return (
                    <span key={id} className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full ${id === store.get().meId ? 'bg-green-light' : 'bg-card'}`}>
                      {u && <Avatar user={u} size={18} emojiSize={10} />}
                      <span className="text-[11px] font-semibold">{nameOf(id)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- host editor with drag & drop ----------
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

  function setGroupsDirty(next: RoundGroup[]) { setGroups(next); setDirty(true); }

  function moveMember(id: string, toZone: string) {
    setGroups((prev) => {
      // remove from all groups first
      let next = prev.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) }));
      if (toZone !== 'pool') {
        next = next.map((g) => {
          if (g.id !== toZone) return g;
          if (g.memberIds.length >= GROUP_MAX) return g; // full → drop back to pool
          return { ...g, memberIds: [...g.memberIds, id] };
        });
      }
      return next;
    });
    setDirty(true);
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    dragRef.current = { id, ox: e.clientX - r.left, oy: e.clientY - r.top };
    const gh = ghostRef.current;
    if (gh) {
      gh.style.display = 'flex';
      gh.style.width = `${r.width}px`;
      gh.textContent = nameOf(id);
      gh.style.left = `${e.clientX - dragRef.current.ox}px`;
      gh.style.top = `${e.clientY - dragRef.current.oy}px`;
    }
    setDraggingId(id);
    try { el.setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    e.preventDefault();
    const gh = ghostRef.current;
    if (gh) { gh.style.left = `${e.clientX - dragRef.current.ox}px`; gh.style.top = `${e.clientY - dragRef.current.oy}px`; }
    highlight(e.clientX, e.clientY);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    e.preventDefault();
    const zone = zoneUnder(e.clientX, e.clientY);
    if (zone) moveMember(dragRef.current.id, zone);
    cleanup();
  }
  function zoneUnder(x: number, y: number): string | null {
    const gh = ghostRef.current;
    if (gh) gh.style.display = 'none';
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (gh) gh.style.display = 'flex';
    const dz = el?.closest('[data-dz]') as HTMLElement | null;
    return dz?.getAttribute('data-dz') || null;
  }
  function highlight(x: number, y: number) {
    const z = zoneUnder(x, y);
    document.querySelectorAll('[data-dz]').forEach((b) => {
      (b as HTMLElement).classList.toggle('ring-2', b.getAttribute('data-dz') === z);
      (b as HTMLElement).classList.toggle('ring-green', b.getAttribute('data-dz') === z);
    });
  }
  function cleanup() {
    const gh = ghostRef.current; if (gh) gh.style.display = 'none';
    document.querySelectorAll('[data-dz]').forEach((b) => { (b as HTMLElement).classList.remove('ring-2', 'ring-green'); });
    dragRef.current = null; setDraggingId(null);
  }

  function addGroup() { setGroupsDirty([...groups, { id: newGroupId(), startTime: '', memberIds: [] }]); }
  function delGroup(gid: string) {
    setGroupsDirty(groups.filter((g) => g.id !== gid)); // members fall back to pool automatically
  }
  function setTime(gid: string, t: string) {
    setGroupsDirty(groups.map((g) => (g.id === gid ? { ...g, startTime: t } : g)));
  }
  function shuffle() {
    const ids = [...participantIds];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const n = Math.max(groups.length, needed);
    const next: RoundGroup[] = Array.from({ length: n }, (_, i) => ({
      id: groups[i]?.id || newGroupId(), startTime: groups[i]?.startTime || '', memberIds: [] as string[],
    }));
    ids.forEach((id, i) => next[i % n].memberIds.push(id));
    setGroupsDirty(next);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds();
      setDirty(false);
      toast('組分けを保存しました');
    } catch (e) { toast('保存失敗: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  const Card = ({ id }: { id: string }) => {
    const u = userOf(id);
    return (
      <div
        onPointerDown={(e) => onPointerDown(e, id)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cleanup}
        className={`flex items-center gap-2 bg-bg border border-border rounded-[10px] px-2.5 py-2 text-[13px] font-bold select-none ${draggingId === id ? 'opacity-30' : ''}`}
        style={{ touchAction: 'none', cursor: 'grab' }}
      >
        <span className="text-muted text-[15px] leading-none">⠿</span>
        {u && <Avatar user={u} size={22} emojiSize={12} />}
        <span className="truncate">{nameOf(id)}</span>
      </div>
    );
  };

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-bold mb-0.5">⛳ 組分け・スタート時間（主催者）</div>
      <div className="text-[10px] text-muted mb-2.5">「未割り当て」から各組へドラッグ。組の追加・削除も可。</div>

      {/* reservation / capacity */}
      <div className="flex items-center justify-between bg-green-light rounded-xl px-3 py-2 mb-2.5">
        <div>
          <div className="text-[10px] text-sub">枠（組数）</div>
          <div className="text-[16px] font-black text-green">{groups.length}組 <span className="text-[10px] text-sub">（最大{groups.length * GROUP_MAX}名）</span></div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => { if (groups.length > 0) delGroup(groups[groups.length - 1].id); }} className="w-8 h-8 rounded-lg border-[1.5px] border-green text-green font-black bg-card">−</button>
          <button onClick={addGroup} className="w-8 h-8 rounded-lg border-[1.5px] border-green text-green font-black bg-card">＋</button>
        </div>
      </div>

      {(pool.length > 0 || groups.length < needed) && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-[11px] font-bold mb-2.5">
          ⚠️ 参加{participantIds.length}人に対して{groups.length}組（最大{groups.length * GROUP_MAX}名）。未割り当て {pool.length}人 — あと{Math.max(0, needed - groups.length)}組ほど必要です。
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button onClick={shuffle} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold">🔀 シャッフル</button>
        <button onClick={addGroup} className="px-3 py-1.5 bg-bg text-sub border border-border rounded-lg text-xs font-bold">＋ 組を追加</button>
        <span className="text-[11px] text-muted self-center">{participantIds.length}人 / {groups.length}組</span>
      </div>

      {/* groups */}
      <div className="flex flex-col gap-2.5">
        {groups.map((g, gi) => (
          <div key={g.id} data-dz={g.id} className="border-2 border-dashed border-border rounded-xl p-2.5">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[13px] font-black">組{gi + 1} <span className="text-[11px] text-muted">({g.memberIds.length}/{GROUP_MAX})</span></span>
              <span className="flex items-center gap-1.5">
                <input type="time" value={g.startTime || ''} onChange={(e) => setTime(g.id, e.target.value)} className="text-[12px] border-[1.5px] border-border rounded-lg px-1.5 py-1 bg-bg" />
                <button onClick={() => delGroup(g.id)} className="w-7 h-7 rounded-lg border border-red-200 text-red-500 font-black bg-card">×</button>
              </span>
            </div>
            <div className="flex flex-col gap-1.5 min-h-[40px]">
              {g.memberIds.length === 0
                ? <div className="text-[11px] text-muted px-1 py-1.5">ここにドラッグ</div>
                : g.memberIds.map((id) => <Card key={id} id={id} />)}
            </div>
          </div>
        ))}
      </div>

      {/* unassigned pool */}
      <div data-dz="pool" className="border border-[#dfe6e2] bg-[#fbfdfc] rounded-xl p-2.5 mt-2.5">
        <div className="text-[13px] font-black mb-1.5">未割り当て <span className="text-[11px] text-muted">({pool.length}人)</span></div>
        {pool.length === 0
          ? <div className="text-[11px] text-muted px-1 py-1">全員 組に割り当て済み ✅</div>
          : <div className="flex flex-wrap gap-1.5">{pool.map((id) => <Card key={id} id={id} />)}</div>}
      </div>

      <button onClick={save} disabled={saving || !dirty} className="w-full mt-3 py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
        {saving ? '保存中…' : dirty ? '組分けを保存する' : '保存済み'}
      </button>

      {/* drag ghost */}
      <div ref={ghostRef} style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
        className="items-center gap-2 bg-white border-[1.5px] border-green rounded-[10px] px-2.5 py-2 text-[13px] font-bold shadow-lg" />
    </div>
  );
}
