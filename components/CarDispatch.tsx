'use client';

import { useMemo, useRef, useState } from 'react';
import type { Round, CarAssignment, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';

let uidSeq = 0;
const isGuest = (id: string) => id.startsWith('gst_');

// 配車ボード。組み分けと同じドラッグ&ドロップで、主催者が「どの車に誰が乗るか」を
// 割り振る。運転者(車)＝ピックアップ回答で「送迎できる(can)」人＋主催者。乗客プール＝
// それ以外の参加者・ゲスト。参加者は自分がどの車かを読み取り専用で確認できる。
export function CarDispatch({ round, users, isHost }: { round: Round; users: User[]; isHost: boolean }) {
  const registeredIds = useMemo(
    () => [round.hostId, ...(round.applicantIds || [])].filter(Boolean),
    [round.hostId, round.applicantIds],
  );
  const guests = round.guests || [];
  const allPeople = useMemo(
    () => [...registeredIds, ...guests.map((g) => g.id)],
    [registeredIds, guests],
  );
  const userOf = (id: string) => users.find((u) => u.id === id);
  const guestOf = (id: string) => guests.find((g) => g.id === id);
  const nameOf = (id: string) => (isGuest(id) ? (guestOf(id)?.name || 'ゲスト') : (userOf(id)?.displayName || 'メンバー'));

  // 運転者（車）の一覧。ピックアップ回答が can の人＋主催者（駅を登録している場合）。
  const pp = round.participantPickups || {};
  const driverIds = useMemo(() => {
    const set = new Set<string>();
    if ((round.pickupStations?.length ?? 0) > 0) set.add(round.hostId);
    for (const id of registeredIds) {
      const v = pp[id];
      const st = v?.status || (v?.stations?.length ? 'can' : undefined);
      if (st === 'can') set.add(id);
    }
    return Array.from(set);
  }, [round.hostId, round.pickupStations, registeredIds, pp]);

  const capacityOf = (id: string) => {
    if (id === round.hostId && (round.pickupStations?.length ?? 0) > 0) return round.pickupCapacity || 0;
    return pp[id]?.capacity || 0;
  };
  const defaultStationOf = (id: string) => {
    if (id === round.hostId && (round.pickupStations?.length ?? 0) > 0) return round.pickupStations?.[0] || '';
    return pp[id]?.stations?.[0] || '';
  };

  // 保存済み配車 → 現在の運転者集合に合わせて初期化。運転者でなくなった車は落とす。
  const driverSet = new Set(driverIds);
  const initial: CarAssignment[] = driverIds.map((did) => {
    const saved = (round.carAssignments || []).find((a) => a.driverId === did);
    return {
      driverId: did,
      passengerIds: (saved?.passengerIds || []).filter((id) => allPeople.includes(id) && id !== did),
      station: saved?.station ?? defaultStationOf(did),
    };
  });

  const [cars, setCars] = useState<CarAssignment[]>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 乗せる相手の候補＝「🙋 ピックアップ希望」か「未入力」の人（＝車がない人）だけ。
  // 「一人で行きます(cannot)」「不要(no_need)」「送迎できる(can=運転者)」は対象外。
  const isPassengerCandidate = (id: string) => {
    if (driverSet.has(id)) return false;
    const v = pp[id];
    const st = v?.status || (v?.stations?.length ? 'can' : undefined);
    return st === 'want' || !st; // 希望 or 未入力のみ
  };
  // 乗客プール = 候補のうち、どの車にも乗っていない人。
  const assigned = new Set(cars.flatMap((c) => c.passengerIds));
  const pool = allPeople.filter((id) => !assigned.has(id) && isPassengerCandidate(id));

  // ---------- read-only view (participants) ----------
  if (!isHost) {
    const saved = (round.carAssignments || []).filter((c) => c.passengerIds.length > 0 || c.station);
    if (!saved.length) return null;
    return (
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-bold mb-2">🚗 配車（車の割り振り）</div>
        <div className="flex flex-col gap-2">
          {saved.map((c, i) => (
            <div key={c.driverId} className="bg-bg rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-[12px] font-bold">🚗 {nameOf(c.driverId)}の車 <span className="text-[10px] text-green font-black">運転</span></span>
                {c.station && <span className="text-[12px] font-bold text-green flex-shrink-0">{c.station}駅</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.passengerIds.length === 0
                  ? <span className="text-[11px] text-muted">同乗者なし</span>
                  : c.passengerIds.map((id) => {
                      const u = userOf(id);
                      return (
                        <span key={id} className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full ${id === store.get().meId ? 'bg-green-light' : 'bg-card'}`}>
                          {u ? <Avatar user={u} size={18} emojiSize={10} /> : <span className="w-[18px] h-[18px] rounded-full bg-bg border border-border flex items-center justify-center text-[10px]">👤</span>}
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

  function setCarsDirty(next: CarAssignment[]) { setCars(next); setDirty(true); }

  function movePassenger(id: string, toZone: string) {
    setCars((prev) => {
      let next = prev.map((c) => ({ ...c, passengerIds: c.passengerIds.filter((m) => m !== id) }));
      if (toZone !== 'pool') {
        next = next.map((c) => (c.driverId === toZone ? { ...c, passengerIds: [...c.passengerIds, id] } : c));
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
    if (zone) movePassenger(dragRef.current.id, zone);
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

  function setStation(did: string, s: string) {
    setCarsDirty(cars.map((c) => (c.driverId === did ? { ...c, station: s } : c)));
  }

  // 未割り当ての候補（希望・未入力）を、空きのある車へ上から詰めていく自動割り当て。
  function autoAssign() {
    const seekers = [...pool];
    let next = cars.map((c) => ({ ...c }));
    for (const sid of seekers) {
      // 定員（運転者含む）に空きがある最初の車へ。
      const car = next.find((c) => {
        const cap = capacityOf(c.driverId);
        return cap === 0 || c.passengerIds.length < cap - 1;
      });
      if (car) car.passengerIds = [...car.passengerIds, sid];
    }
    setCarsDirty(next);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/car-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: cars }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds();
      setDirty(false);
      toast('配車を保存しました🚗');
    } catch (e) { toast('保存失敗: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  const renderPassenger = (id: string, inCar?: boolean) => {
    const u = userOf(id);
    const v = pp[id];
    const st = v?.status || (v?.stations?.length ? 'can' : undefined);
    return (
      <div
        key={id}
        onPointerDown={(e) => onPointerDown(e, id)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cleanup}
        className={`flex items-center gap-2 bg-bg border border-border rounded-[10px] px-2.5 py-2 text-[13px] font-bold select-none ${draggingId === id ? 'opacity-30' : ''}`}
        style={{ touchAction: 'none', cursor: 'grab' }}
      >
        <span className="text-muted text-[15px] leading-none">⠿</span>
        {u ? <Avatar user={u} size={22} emojiSize={12} /> : <span className="w-[22px] h-[22px] rounded-full bg-bg border border-border flex items-center justify-center text-[12px]">👤</span>}
        <span className="truncate">{nameOf(id)}</span>
        {st === 'want' && <span className="text-[9px] font-bold text-orange bg-orange-light border border-orange rounded px-1 flex-shrink-0">🙋希望</span>}
        {isGuest(id) && <span className="text-[9px] font-bold text-sub bg-bg border border-border rounded px-1 flex-shrink-0">ゲスト</span>}
        {v?.stations?.length ? <span className="text-[9px] text-muted font-normal flex-shrink-0">{v.stations[0]}駅</span> : null}
        {inCar && (
          <button type="button" aria-label="未割り当てに戻す"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); movePassenger(id, 'pool'); }}
            className="ml-auto w-5 h-5 rounded-full bg-red-100 text-red-600 text-[12px] leading-none flex items-center justify-center flex-shrink-0"
          >×</button>
        )}
      </div>
    );
  };

  if (driverIds.length === 0) {
    return (
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-bold mb-1">🚗 配車（車の割り振り）</div>
        <div className="text-[11px] text-muted">送迎できる人（車あり）がまだいません。ピックアップで「🚗 ピックアップできます」の回答が入ると、その人の車がここに表示されます。</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <div className="text-[13px] font-bold mb-0.5">🚗 配車（車の割り振り）（主催者）</div>
      <div className="text-[10px] text-muted mb-2.5">「未割り当て」から各車へドラッグ。運転者は「ピックアップできます」と答えた人です。定員は運転者を含みます。</div>

      <div className="flex gap-2 mb-3">
        <button onClick={autoAssign} disabled={pool.length === 0} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold disabled:opacity-50">🪄 自動割り当て</button>
        <span className="text-[11px] text-muted self-center">車 {cars.length}台 / 未割り当て {pool.length}人</span>
      </div>

      {/* cars */}
      <div className="flex flex-col gap-2.5">
        {cars.map((c) => {
          const cap = capacityOf(c.driverId);
          const riders = c.passengerIds.length + 1; // 運転者を含む
          const over = cap > 0 && riders > cap;
          const du = userOf(c.driverId);
          return (
            <div key={c.driverId} data-dz={c.driverId} className={`border-2 border-dashed rounded-xl p-2.5 ${over ? 'border-red-400 bg-red-50' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-black">
                  🚗 {du ? <Avatar user={du} size={20} emojiSize={11} /> : null}{nameOf(c.driverId)}の車
                  <span className={`text-[11px] ${over ? 'text-red-600 font-bold' : 'text-muted'}`}>({riders}{cap ? `/${cap}` : ''}名)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-muted flex-shrink-0">🚉 集合</span>
                <input
                  value={c.station || ''}
                  onChange={(e) => setStation(c.driverId, e.target.value.slice(0, 20))}
                  placeholder="駅名など"
                  className="flex-1 min-w-0 text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1 bg-bg outline-none"
                />
              </div>
              {over && <div className="text-[10px] text-red-600 font-bold mb-1.5">⚠️ 定員オーバーです（運転者含め{riders}名 / 定員{cap}名）</div>}
              <div className="flex flex-col gap-1.5 min-h-[36px]">
                {c.passengerIds.length === 0
                  ? <div className="text-[11px] text-muted px-1 py-1.5">ここに同乗者をドラッグ</div>
                  : c.passengerIds.map((id) => renderPassenger(id, true))}
              </div>
            </div>
          );
        })}
      </div>

      {/* unassigned pool */}
      <div data-dz="pool" className="border border-[#dfe6e2] bg-[#fbfdfc] rounded-xl p-2.5 mt-2.5">
        <div className="text-[13px] font-black mb-1.5">未割り当て <span className="text-[11px] text-muted">({pool.length}人)</span></div>
        {pool.length === 0
          ? <div className="text-[11px] text-muted px-1 py-1">全員 車に割り当て済み ✅</div>
          : <div className="flex flex-wrap gap-1.5">{pool.map((id) => renderPassenger(id))}</div>}
      </div>

      <button onClick={save} disabled={saving || !dirty} className="w-full mt-3 py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
        {saving ? '保存中…' : dirty ? '配車を保存する' : '保存済み'}
      </button>

      {/* drag ghost */}
      <div ref={ghostRef} style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
        className="items-center gap-2 bg-white border-[1.5px] border-green rounded-[10px] px-2.5 py-2 text-[13px] font-bold shadow-lg" />
    </div>
  );
}
