'use client';

import { useMemo, useRef, useState } from 'react';
import type { Round, RoundGroup, RoundGuest, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';

const GROUP_MAX = 4;
let uidSeq = 0;
const newGroupId = () => `g_${Date.now()}_${(uidSeq++).toString(36)}`;
const newGuestId = () => `gst_${Date.now()}_${(uidSeq++).toString(36)}`;
const isGuest = (id: string) => id.startsWith('gst_');

export function GroupAssignment({ round, users, isHost }: { round: Round; users: User[]; isHost: boolean }) {
  const registeredIds = useMemo(
    () => [round.hostId, ...(round.applicantIds || [])].filter(Boolean),
    [round.hostId, round.applicantIds],
  );
  const [guests, setGuests] = useState<RoundGuest[]>(round.guests || []);
  const [guestName, setGuestName] = useState('');
  // 組み分け対象 = 登録参加者 ＋ ゲスト。
  const participantIds = useMemo(
    () => [...registeredIds, ...guests.map((g) => g.id)],
    [registeredIds, guests],
  );
  const userOf = (id: string) => users.find((u) => u.id === id);
  const guestOf = (id: string) => guests.find((g) => g.id === id);
  const nameOf = (id: string) => (isGuest(id) ? (guestOf(id)?.name || 'ゲスト') : (userOf(id)?.displayName || 'メンバー'));
  // 名前の横に小さく出す「性別・年齢・スコア」。ゲストは情報なし。
  const metaOf = (id: string) => {
    if (isGuest(id)) return '';
    const u = userOf(id);
    if (!u) return '';
    const g = u.gender === 'male' ? '♂' : u.gender === 'female' ? '♀' : '';
    const sr = (u as any).scoreRange ? String((u as any).scoreRange) : '';
    return [g, u.age ? `${u.age}歳` : '', sr].filter(Boolean).join('・');
  };

  // Build initial groups from saved data, dropping ids no longer present.
  const validInit = new Set<string>([...registeredIds, ...((round.guests || []).map((g) => g.id))]);
  const initial: RoundGroup[] = (round.groups || []).map((g) => ({
    id: g.id || newGroupId(),
    startTime: g.startTime,
    memberIds: (g.memberIds || []).filter((id) => validInit.has(id)),
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
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-[12px] font-bold">組{gi + 1}{g.course && <span className="ml-1.5 text-[11px] font-bold text-blue">⛳ {g.course}</span>}</span>
                <span className="text-[12px] font-bold text-green flex-shrink-0">{g.startTime || '時間未定'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.memberIds.map((id) => {
                  const u = userOf(id);
                  const meta = metaOf(id);
                  return (
                    <span key={id} className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full ${id === store.get().meId ? 'bg-green-light' : 'bg-card'}`}>
                      {u
                        ? <Avatar user={u} size={18} emojiSize={10} />
                        : <span className="w-[18px] h-[18px] rounded-full bg-bg border border-border flex items-center justify-center text-[10px]">👤</span>}
                      <span className="text-[11px] font-semibold">{nameOf(id)}</span>
                      {meta && <span className="text-[9px] text-muted font-normal">（{meta}）</span>}
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
        // 満員でも一時的に受け入れる（他の組へスライドして入れ替えできるように）。
        // 4名超は赤＋「人数オーバー」警告で知らせる。
        next = next.map((g) => (g.id === toZone ? { ...g, memberIds: [...g.memberIds, id] } : g));
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
  function setCourse(gid: string, c: string) {
    setGroupsDirty(groups.map((g) => (g.id === gid ? { ...g, course: c } : g)));
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

  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    setGuests((prev) => [...prev, { id: newGuestId(), name: name.slice(0, 30) }]);
    setGuestName('');
    setDirty(true);
  }
  function removeGuest(id: string) {
    setGuests((prev) => prev.filter((g) => g.id !== id));
    setGroups((prev) => prev.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, guests }), cache: 'no-store',
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
        {u
          ? <Avatar user={u} size={22} emojiSize={12} />
          : <span className="w-[22px] h-[22px] rounded-full bg-bg border border-border flex items-center justify-center text-[12px]">👤</span>}
        <span className="truncate">{nameOf(id)}</span>
        {metaOf(id) && <span className="text-[10px] text-muted font-normal flex-shrink-0">（{metaOf(id)}）</span>}
        {isGuest(id) && <span className="text-[9px] font-bold text-sub bg-bg border border-border rounded px-1 ml-0.5 flex-shrink-0">ゲスト</span>}
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

      {/* コース種別の候補（自由入力も可） */}
      <datalist id="courseOptions">
        <option value="IN-OUT" />
        <option value="OUT-IN" />
        <option value="INコース" />
        <option value="OUTコース" />
      </datalist>

      {/* groups */}
      <div className="flex flex-col gap-2.5">
        {groups.map((g, gi) => {
          const over = g.memberIds.length > GROUP_MAX;
          return (
          <div key={g.id} data-dz={g.id} className={`border-2 border-dashed rounded-xl p-2.5 ${over ? 'border-red-400 bg-red-50' : 'border-border'}`}>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[13px] font-black">組{gi + 1} <span className={`text-[11px] ${over ? 'text-red-600 font-bold' : 'text-muted'}`}>({g.memberIds.length}/{GROUP_MAX})</span></span>
              <span className="flex items-center gap-1.5">
                <input type="time" value={g.startTime || ''} onChange={(e) => setTime(g.id, e.target.value)} className="text-[12px] border-[1.5px] border-border rounded-lg px-1.5 py-1 bg-bg w-[88px]" />
                <button onClick={() => delGroup(g.id)} className="w-7 h-7 rounded-lg border border-red-200 text-red-500 font-black bg-card">×</button>
              </span>
            </div>
            {/* コース種別（IN-OUT / OUT-IN 等。選択後の編集・自由入力も可） */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] text-muted flex-shrink-0">⛳ コース</span>
              <input
                list="courseOptions"
                value={g.course || ''}
                onChange={(e) => setCourse(g.id, e.target.value)}
                placeholder="IN-OUT / OUT-IN / 自由入力"
                maxLength={30}
                className="flex-1 min-w-0 text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1 bg-bg outline-none"
              />
            </div>
            {over && <div className="text-[10px] text-red-600 font-bold mb-1.5">⚠️ 人数オーバーです（{g.memberIds.length}名 / 規定{GROUP_MAX}名）</div>}
            <div className="flex flex-col gap-1.5 min-h-[40px]">
              {g.memberIds.length === 0
                ? <div className="text-[11px] text-muted px-1 py-1.5">ここにドラッグ</div>
                : g.memberIds.map((id) => <Card key={id} id={id} />)}
            </div>
          </div>
          );
        })}
      </div>

      {/* ゲスト（ゴルトモ未登録）追加 */}
      <div className="border border-border rounded-xl p-2.5 mt-2.5 bg-card">
        <div className="text-[13px] font-black mb-1.5">👤 ゲストを追加 <span className="text-[10px] text-muted font-normal">（ゴルトモ未登録の人）</span></div>
        <div className="flex gap-1.5 mb-2">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addGuest(); }}
            placeholder="名前を入力（例: 田中さん）"
            maxLength={30}
            className="flex-1 min-w-0 text-[13px] border-[1.5px] border-border rounded-lg px-2.5 py-1.5 bg-bg outline-none"
          />
          <button onClick={addGuest} disabled={!guestName.trim()} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold disabled:opacity-50">追加</button>
        </div>
        {guests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {guests.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1 bg-bg border border-border rounded-full pl-2 pr-1 py-0.5 text-[11px] font-bold">
                👤 {g.name}
                <button onClick={() => removeGuest(g.id)} aria-label="削除" className="w-4 h-4 rounded-full bg-red-100 text-red-600 text-[11px] leading-none flex items-center justify-center">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="text-[10px] text-muted mt-1.5">追加したゲストは下の「未割り当て」に並びます。各組へドラッグしてください。</div>
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
