'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@/components/Portal';
import type { Round, RoundGroup, RoundGuest, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { AssignmentsPublishBar } from '@/components/AssignmentsPublishBar';

const GROUP_MAX = 4;
let uidSeq = 0;
const newGroupId = () => `g_${Date.now()}_${(uidSeq++).toString(36)}`;
const newGuestId = () => `gst_${Date.now()}_${(uidSeq++).toString(36)}`;
const isGuest = (id: string) => id.startsWith('gst_');
// スタートのコース種別。プリセット2つ＋自由記入。OUT=アウトスタート / IN=インスタート。
const COURSE_PRESETS = ['OUT', 'IN'];

export function GroupAssignment({ round, users, isHost }: { round: Round; users: User[]; isHost: boolean }) {
  const registeredIds = useMemo(
    () => [round.hostId, ...(round.applicantIds || [])].filter(Boolean),
    [round.hostId, round.applicantIds],
  );
  const [guests, setGuests] = useState<RoundGuest[]>(round.guests || []);
  const [guestName, setGuestName] = useState('');
  const [guestGender, setGuestGender] = useState<'male' | 'female'>('male');   // 知り合い枠を男女で数えるため
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
    course: g.course,   // 保存はされていたのに、ここで落としていて開き直すと消えて見えた（2026-10-04）
    memberIds: (g.memberIds || []).filter((id) => validInit.has(id)),
  }));
  const [groups, setGroups] = useState<RoundGroup[]>(initial.length ? initial : []);
  // 後半の組。前半と入れ替えるコンペ（後ろの組へ2人行き、後ろから2人来る等）のためのもの。
  // 「入れ替えあり」にした瞬間に前半をコピーし、そこから動かす。保存時は backOn でなければ空。
  // レビュー対象は前半・後半のどちらかで同じ組になった人すべて（lib/groups）。
  const initialBack: RoundGroup[] = (round.groupsBack || []).map((g) => ({
    id: g.id || newGroupId(), startTime: g.startTime, course: g.course,
    memberIds: (g.memberIds || []).filter((id) => validInit.has(id)),
  }));
  const [backOn, setBackOn] = useState<boolean>(initialBack.length > 0);
  const [groupsBack, setGroupsBack] = useState<RoundGroup[]>(initialBack);
  // 当日来れなかった人（登録ユーザーのみ・除外扱い）。組が無くてもエラーにならず、
  // レビュー対象からも外れる。
  const [noShow, setNoShow] = useState<string[]>(
    () => (round.noShowIds || []).filter((id) => registeredIds.includes(id)),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 「＋ 追加」を押した組（後半は 'back:<組id>'）。ドラッグ＆ドロップは残すが、
  // 画面の下の「未割り当て」から上の組までドラッグで運ぶのはスクロールできず難しい、
  // という指摘があったので、組の側から選んで入れられるようにした。
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // 「＋ 追加」で、ほかの組に入っている人も選べるようにする（2026-10-05 本人要望）。
  // まず未割り当てだけを出し、「割り当て済みの人から選ぶ」を開くとほかの組の人が出る。選ぶと元の組から抜ける。
  const [pickerShowAssigned, setPickerShowAssigned] = useState(false);
  // 自由記入モードの組（コースがプリセット以外、または「自由記入」を選んだ組）。
  const [freeCourse, setFreeCourse] = useState<Set<string>>(() => {
    const s = new Set<string>();
    (round.groups || []).forEach((g) => { if (g.course && !COURSE_PRESETS.includes(g.course)) s.add(g.id); });
    return s;
  });
  const showFree = (g: RoundGroup) => freeCourse.has(g.id) || (!!g.course && !COURSE_PRESETS.includes(g.course));
  const courseSelectValue = (g: RoundGroup) => (g.course && COURSE_PRESETS.includes(g.course)) ? g.course : (showFree(g) ? '__free__' : '');
  function onCourseSelect(gid: string, v: string) {
    if (v === '__free__') { setFreeCourse((p) => new Set(p).add(gid)); setCourse(gid, ''); }
    else { setFreeCourse((p) => { const n = new Set(p); n.delete(gid); return n; }); setCourse(gid, v); }
  }

  const assigned = new Set(groups.flatMap((g) => g.memberIds));
  const noShowSet = new Set(noShow);
  // 未割り当て = 組にも「当日来れなかった人」にも入っていない参加者。
  const pool = participantIds.filter((id) => !assigned.has(id) && !noShowSet.has(id));
  // 後半の未割り当て（前半で組にいて、後半のどの組にもいない人）。「＋ 追加」の候補に使う。
  const backPoolAll = backOn
    ? (() => { const inBack = new Set(groupsBack.flatMap((g) => g.memberIds)); return groups.flatMap((g) => g.memberIds).filter((id) => !inBack.has(id)); })()
    : [];
  const needed = Math.ceil(Math.max(0, participantIds.length - noShow.length) / GROUP_MAX);

  // ---------- read-only view (non-host) ----------
  // ドラッグ用の ref。もとは下の「host editor」側（閲覧用の早期 return の後ろ）で宣言していたため、
  // 読み込み中は閲覧用→主催者と分かって編集用、と切り替わる瞬間に hook の数が増えて React #310 で落ちうる
  // （2026-10-06・round ページの同種バグの横展開。hook は必ず早期 return より前に置く）。
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number; board: 'front' | 'back' } | null>(null);
  // 主催者だけ：参加者の本名（ゴルフ場の予約サイトに登録する用。participant-names は主催者限定 API）（2026-10-08）
  const [realNames, setRealNames] = useState<Record<string, string>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [pairHistory, setPairHistory] = useState<Record<string, { sameGroup: number; sameEvent: number }>>({});
  useEffect(() => {
    if (!isHost || !round.id) return;
    fetch(`/api/rounds/${round.id}/participant-names`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.names) setRealNames(j.names); }).catch(() => {});
    // 過去に同じ組／同じコンペだった回数（主催者だけ）（2026-10-08）
    fetch(`/api/rounds/${round.id}/pair-history`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.pairs) setPairHistory(j.pairs); }).catch(() => {});
  }, [isHost, round.id, round.applicantIds]);
  if (!isHost) {
    if (!groups.length) {
      // 組み分けはあるが主催者がまだ公開していない（2026-10-06）
      if (round.assignmentsHidden) {
        return (
          <div className="bg-card rounded-card p-4 shadow-card mb-4">
            <div className="text-[13px] font-bold mb-1">⛳ 組分け・スタート時間</div>
            <div className="text-[12px] text-sub leading-relaxed">主催者が準備中です。公開されるとここに表示され、お知らせが届きます。</div>
          </div>
        );
      }
      return null;
    }
    const showBack = groupsBack.length > 0;
    const listOf = (gs: RoundGroup[], half: 'front' | 'back' = 'front') => gs.map((g, gi) => (
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
                      {half === 'back' && (() => { const fi = groups.findIndex((x) => x.memberIds.includes(id)); if (fi < 0) return null; return groups[fi].id === g.id
                        ? <span className="text-[9px] font-bold text-green">前半も一緒</span>
                        : <span className="text-[9px] font-bold text-orange">🔁 前半{fi + 1}組から</span>; })()}
                    </span>
                  );
                })}
              </div>
            </div>
          ));
    return (
      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-bold mb-2">⛳ 組分け・スタート時間{showBack && <span className="text-[11px] text-sub ml-1.5">（前半）</span>}</div>
        <div className="flex flex-col gap-2">{listOf(groups)}</div>
        {showBack && (
          <>
            <div className="text-[13px] font-bold mt-3 mb-2">🔁 後半の組<span className="text-[11px] text-sub ml-1.5">（前半と入れ替え）</span></div>
            <div className="text-[10.5px] text-sub mb-1.5">後半（折り返し）で組が入れ替わります。「🔁 前半◯組から」の人が、後半に新しく一緒になる人です。</div>
            <div className="flex flex-col gap-2">{listOf(groupsBack, 'back')}</div>
          </>
        )}
      </div>
    );
  }

  // ---------- host editor with drag & drop ----------
  // 落とし先がどちらの盤か。後半の盤は 'back:<組id>' と 'backpool'。
  const boardOf = (zone: string): 'front' | 'back' => (zone.startsWith('back') ? 'back' : 'front');

  function setGroupsDirty(next: RoundGroup[]) { setGroups(next); setDirty(true); }

  // 組み分け希望の「同じ組は避けたい」に当たっている組み合わせ。
  // 希望の一覧は上に出しているが、人数が多いと目で突き合わせきれない。
  // 組に入れた瞬間にその組の中で出す。**主催者にしか出さない**（この編集部は主催者専用）。
  // 片方向でも出す（AがCを避けたいだけで十分）。両方向なら1件にまとめる。
  const nameOfUser = (id: string) => users.find((u) => u.id === id)?.displayName || 'メンバー';
  function avoidHits(memberIds: string[]): { a: string; b: string; mutual: boolean }[] {
    const prefs = round.groupPrefs || {};
    const inGroup = new Set(memberIds);
    const hits: { a: string; b: string; mutual: boolean }[] = [];
    const seen = new Set<string>();
    for (const a of memberIds) {
      for (const b of prefs[a]?.avoid || []) {
        if (!inGroup.has(b)) continue;
        const key = [a, b].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const mutual = (prefs[b]?.avoid || []).includes(a);
        hits.push({ a, b, mutual });
      }
    }
    return hits;
  }

  function moveMember(id: string, toZone: string) {
    // 後半の盤：後半の組の間だけで動かす（'backpool' は「後半のどの組にもいない」）。
    if (boardOf(toZone) === 'back') {
      const gid = toZone === 'backpool' ? '' : toZone.slice('back:'.length);
      setGroupsBack((prev) => {
        let next = prev.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) }));
        if (gid) next = next.map((g) => (g.id === gid ? { ...g, memberIds: [...g.memberIds, id] } : g));
        return next;
      });
      setDirty(true);
      return;
    }
    // ゲストは「当日来れなかった人」にはできない（レビュー対象外なので不要）。
    const targetZone = toZone === 'noshow' && isGuest(id) ? 'pool' : toZone;
    setGroups((prev) => {
      // remove from all groups first
      let next = prev.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) }));
      if (targetZone !== 'pool' && targetZone !== 'noshow') {
        // 満員でも一時的に受け入れる（他の組へスライドして入れ替えできるように）。
        // 4名超は赤＋「人数オーバー」警告で知らせる。
        next = next.map((g) => (g.id === targetZone ? { ...g, memberIds: [...g.memberIds, id] } : g));
      }
      return next;
    });
    // 「当日来れなかった人」への出し入れ。
    setNoShow((prev) => (targetZone === 'noshow' ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
    setDirty(true);
  }

  function onPointerDown(e: React.PointerEvent, id: string, board: 'front' | 'back' = 'front') {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    dragRef.current = { id, ox: e.clientX - r.left, oy: e.clientY - r.top, board };
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
    // 前半の札を後半の盤に落とす（またはその逆）のは無効。盤をまたぐ移動は意味を持たないため。
    if (zone && boardOf(zone) === dragRef.current.board) moveMember(dragRef.current.id, zone);
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
  // 組を1つ上/下へ移動して並び順を変える（例：1組目のメンバーを3組目へ）。
  // 「枠（位置）」の時間・コースは固定したまま、メンバーだけを上下の枠と入れ替える。
  // スタート時間は枠の並び（9:30→10:00…）に紐づくもので、組を動かしても時間は
  // ずらさない（＝時間はそのまま、その枠に入る人だけが変わる）。
  function moveGroup(gid: string, dir: -1 | 1) {
    const idx = groups.findIndex((g) => g.id === gid);
    if (idx < 0) return;
    const to = idx + dir;
    if (to < 0 || to >= groups.length) return;
    const next = [...groups];
    next[idx] = { ...groups[idx], memberIds: groups[to].memberIds };
    next[to] = { ...groups[to], memberIds: groups[idx].memberIds };
    setGroupsDirty(next);
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
    setGuests((prev) => [...prev, { id: newGuestId(), name: name.slice(0, 30), gender: guestGender }]);
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
        body: JSON.stringify({ groups, groupsBack: backOn ? groupsBack : [], guests, noShowIds: noShow }), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds();
      setDirty(false);
      toast('組分けを保存しました');
    } catch (e) { toast('保存失敗: ' + (e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  // 重要: ここは「コンポーネント」ではなく「JSXを返す関数」にしている。
  // <Card/> としてコンポーネント化すると毎レンダーで型が変わり、ドラッグ開始時の
  // setDraggingId による再レンダーでカードのDOMが作り直され、ポインターキャプチャが
  // 外れてドロップが効かなくなる（移動できないバグの原因）。key付き要素を直接返して
  // 同一DOMを保ち、キャプチャを維持する。
  // 前半・後半の入れ替えをわかりやすく（2026-10-10）：札に「前半も同じ組」「前半は◯組から」「後半は◯組へ」
  const frontIdxOf = (id: string) => groups.findIndex((g) => g.memberIds.includes(id));
  const backIdxOf = (id: string) => groupsBack.findIndex((g) => g.memberIds.includes(id));
  const swapBadge = (id: string, board: 'front' | 'back', groupId?: string) => {
    if (!backOn || !groupsBack.length) return null;
    if (board === 'back') {
      const fi = frontIdxOf(id);
      if (fi < 0) return null;
      if (groupId && groups[fi].id === groupId) return <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full bg-green-light text-green border border-green flex-shrink-0">前半も同じ組</span>;
      return <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full bg-orange-light text-orange border border-orange flex-shrink-0">🔁 前半は{fi + 1}組{groupId ? 'から' : ''}</span>;
    }
    const bi = backIdxOf(id); const fi = frontIdxOf(id);
    if (bi < 0 || fi < 0) return null;
    const bfi = groups.findIndex((g) => g.id === groupsBack[bi].id);
    if (bfi === fi) return null;
    return <span className="text-[9px] font-black px-1.5 py-[1px] rounded-full bg-orange-light text-orange border border-orange flex-shrink-0">🔁 後半は{(bfi >= 0 ? bfi : bi) + 1}組へ</span>;
  };
  const renderMember = (id: string, inGroup?: boolean, inNoShow?: boolean, board: 'front' | 'back' = 'front', groupId?: string) => {
    const u = userOf(id);
    return (
      <div
        key={id}
        onPointerDown={(e) => onPointerDown(e, id, board)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cleanup}
        className={`flex items-center gap-2 bg-bg border border-border rounded-[10px] px-2.5 py-2 text-[13px] font-bold select-none ${draggingId === id ? 'opacity-30' : ''}`}
        style={{ touchAction: 'none', cursor: 'grab' }}
      >
        <span className="text-muted text-[15px] leading-none flex-shrink-0">⠿</span>
        {u
          ? <Avatar user={u} size={22} emojiSize={12} />
          : <span className="w-[22px] h-[22px] rounded-full bg-bg border border-border flex items-center justify-center text-[12px] flex-shrink-0">👤</span>}
        {/* 名前は縮み、補足は折り返す（枠からはみ出さない） */}
        <span className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
          <span className="truncate min-w-0 max-w-full">{nameOf(id)}</span>
          {realNames[id] && <span className="text-[10px] text-green font-bold flex-shrink-0">📋 {realNames[id]}</span>}
          {metaOf(id) && <span className="text-[10px] text-muted font-normal break-words">（{metaOf(id)}）</span>}
          {isGuest(id) && <span className="text-[9px] font-bold text-sub bg-bg border border-border rounded px-1 flex-shrink-0">ゲスト</span>}
          {(inGroup || board === 'back') && swapBadge(id, board, groupId)}
        </span>
        {(inGroup || inNoShow) && (
          <button
            type="button"
            aria-label="未割り当てに戻す"
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); moveMember(id, board === 'back' ? 'backpool' : 'pool'); }}
            className="ml-auto w-5 h-5 rounded-full bg-red-100 text-red-600 text-[12px] leading-none flex items-center justify-center flex-shrink-0"
          >×</button>
        )}
      </div>
    );
  };

  // 同じ組になった人どうしの「つながり」（主催者が組を決める参考）。
  //   🚗 今回の行きの車が一緒 ／ 🔁 過去に同じ組で回った ／ 👥 過去に同じコンペ（別の組）
  function pairNotes(memberIds: string[]): string[] {
    const carOf = new Map<string, number>();
    (round.carAssignments || []).forEach((c, i) => { [c.driverId, ...(c.passengerIds || [])].forEach((id) => id && carOf.set(id, i)); });
    const out: string[] = [];
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = memberIds[i], b = memberIds[j];
        const parts: string[] = [];
        if (carOf.has(a) && carOf.get(a) === carOf.get(b)) parts.push('🚗 行きの車が一緒');
        const h = pairHistory[a < b ? `${a}|${b}` : `${b}|${a}`];
        if (h?.sameGroup) parts.push(`🔁 過去に同じ組で${h.sameGroup}回`);
        if (h?.sameEvent) parts.push(`👥 過去に同じコンペ（別の組）${h.sameEvent}回`);
        if (parts.length) out.push(`${nameOf(a)}さんと${nameOf(b)}さん：${parts.join('・')}`);
      }
    }
    return out;
  }
  const renderPairNotes = (memberIds: string[]) => {
    const notes = pairNotes(memberIds);
    if (!notes.length) return null;
    return (
      <div className="mt-1.5 rounded-lg bg-[#F3F7FF] border border-[#C9D8F5] px-2 py-1.5">
        {notes.map((n, i) => <div key={i} className="text-[10.5px] text-[#2F4A7A] leading-snug">{n}</div>)}
      </div>
    );
  };

  // ゴルフ場に送る用のテキスト：本名（姓 名）で、組ごとにコース・スタート時間・メンバー。後半の入れ替えがあれば後半も。
  // ゴルフ場に送る組分け（テキスト・画像の共通データ）
  type CourseSheet = { title: string; sub: string; count: string; sections: Array<{ head: string; groups: Array<{ label: string; members: string[] }> }>; unassigned: string[] };
  function buildCourseSheet(): CourseSheet {
    const fullName = (id: string) => (isGuest(id) ? (guestOf(id)?.name || 'ゲスト') : (realNames[id] || `${nameOf(id)}（本名未登録）`));
    const d = round.date ? new Date(round.date) : null;
    const dateStr = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）` : (round.date || '');
    const all = groups.flatMap((g) => g.memberIds);
    const back = backOn && groupsBack.length > 0;
    const sections: CourseSheet['sections'] = [{
      head: back ? '前半' : '',
      groups: groups.map((g, i) => ({ label: `${i + 1}組${g.course ? ` ${g.course}` : ''}${g.startTime ? ` ${g.startTime}スタート` : ''}`, members: g.memberIds.map(fullName) })),
    }];
    if (back) sections.push({
      head: '後半（組の入れ替えあり）',
      groups: groupsBack.map((g, gi) => { const fi = groups.findIndex((x) => x.id === g.id); return { label: `${fi >= 0 ? fi + 1 : gi + 1}組（後半）`, members: g.memberIds.map(fullName) }; }),
    });
    return {
      title: round.title || 'ラウンド', sub: [dateStr, round.courseName].filter(Boolean).join(' '), count: `${all.length}名・${groups.length}組`,
      sections, unassigned: participantIds.filter((id) => !all.includes(id) && !noShow.includes(id)).map(fullName),
    };
  }

  function buildCourseText(): string {
    const fullName = (id: string) => {
      if (isGuest(id)) return guestOf(id)?.name || 'ゲスト';
      return realNames[id] || `${nameOf(id)}（本名未登録）`;
    };
    const d = round.date ? new Date(round.date) : null;
    const dateStr = d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）` : (round.date || '');
    const all = groups.flatMap((g) => g.memberIds);
    const lines: string[] = [];
    lines.push(`【${round.title || 'ラウンド'}】`);
    lines.push([dateStr, round.courseName].filter(Boolean).join(' '));
    lines.push(`${all.length}名・${groups.length}組`);
    lines.push('');
    if (backOn && groupsBack.length) lines.push('■ 前半');
    groups.forEach((g, i) => {
      lines.push(`${i + 1}組${g.course ? ` ${g.course}` : ''}${g.startTime ? ` ${g.startTime}スタート` : ''}`);
      g.memberIds.forEach((id) => lines.push(`  ${fullName(id)}`));
      if (!g.memberIds.length) lines.push('  （未定）');
      lines.push('');
    });
    if (backOn && groupsBack.length) {
      lines.push('■ 後半（組の入れ替えあり）');
      groupsBack.forEach((g, gi) => {
        const fi = groups.findIndex((x) => x.id === g.id);
        lines.push(`${fi >= 0 ? fi + 1 : gi + 1}組（後半）`);
        g.memberIds.forEach((id) => lines.push(`  ${fullName(id)}`));
        if (!g.memberIds.length) lines.push('  （未定）');
        lines.push('');
      });
    }
    const unassigned = participantIds.filter((id) => !all.includes(id) && !noShow.includes(id));
    if (unassigned.length) { lines.push('■ 未割り当て'); unassigned.forEach((id) => lines.push(`  ${fullName(id)}`)); }
    return lines.join(String.fromCharCode(10)).trim() + String.fromCharCode(10);
  }

  return (
    <div className="bg-card rounded-card p-4 shadow-card mb-4">
      <AssignmentsPublishBar round={round} target="groups" />
      <button type="button" onClick={() => setExportOpen(true)}
        className="w-full mb-2.5 py-2 rounded-xl border-[1.5px] border-green bg-card text-green text-[12.5px] font-black">
        📄 ゴルフ場に送る組分けテキスト（本名）
      </button>
      {exportOpen && (
        <GolfCourseExport
          text={buildCourseText()}
          sheet={buildCourseSheet()}
          roundId={round.id}
          onClose={() => setExportOpen(false)}
          dirty={dirty}
        />
      )}
      <div className="text-[13px] font-bold mb-0.5">⛳ 組分け・スタート時間（主催者）</div>
      <div className="text-[10px] text-muted mb-2.5">各組の「＋ 追加」から未割り当ての人を選んで入れられます（ドラッグでも可）。メンバーの「×」または外へドラッグで未割り当てに戻せます。</div>

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

      {(() => {
        const n = groups.reduce((acc, g) => acc + avoidHits(g.memberIds).length, 0);
        if (!n) return null;
        return (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-[11px] font-bold mb-2.5">
            ⚠️ 「同じ組は避けたい」希望に当たっている組み合わせが{n}件あります（下の組の中に表示）
          </div>
        );
      })()}

      <div className="flex gap-2 mb-3">
        <button onClick={shuffle} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold">🔀 シャッフル</button>
        <button onClick={addGroup} className="px-3 py-1.5 bg-bg text-sub border border-border rounded-lg text-xs font-bold">＋ 組を追加</button>
        <span className="text-[11px] text-muted self-center">{participantIds.length}人 / {groups.length}組</span>
      </div>

      {/* groups */}
      <div className="flex flex-col gap-2.5">
        {groups.map((g, gi) => {
          const over = g.memberIds.length > GROUP_MAX;
          return (
          <div key={g.id} data-dz={g.id} className={`border-2 border-dashed rounded-xl p-2.5 ${over ? 'border-red-400 bg-red-50' : 'border-border'}`}>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13px] font-black whitespace-nowrap">組{gi + 1} <span className={`text-[11px] ${over ? 'text-red-600 font-bold' : 'text-muted'}`}>({g.memberIds.length}/{GROUP_MAX})</span></span>
                {/* 組全体の並び替え（この組を上/下へ。例：1組目を3組目へ） */}
                <span className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => moveGroup(g.id, -1)} disabled={gi === 0} aria-label="この組を上へ" className="w-6 h-6 rounded-md border border-border text-sub font-black bg-card text-[11px] leading-none disabled:opacity-30">↑</button>
                  <button onClick={() => moveGroup(g.id, 1)} disabled={gi === groups.length - 1} aria-label="この組を下へ" className="w-6 h-6 rounded-md border border-border text-sub font-black bg-card text-[11px] leading-none disabled:opacity-30">↓</button>
                </span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <input type="time" value={g.startTime || ''} onChange={(e) => setTime(g.id, e.target.value)} className="text-[12px] border-[1.5px] border-border rounded-lg px-1.5 py-1 bg-bg w-[88px]" />
                <button onClick={() => delGroup(g.id)} className="w-7 h-7 rounded-lg border border-red-200 text-red-500 font-black bg-card">×</button>
              </span>
            </div>
            {/* スタートのコース（アウト/イン/自由記入） */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] text-muted flex-shrink-0">⛳ コース</span>
              <select
                value={courseSelectValue(g)}
                onChange={(e) => onCourseSelect(g.id, e.target.value)}
                className="flex-1 min-w-0 text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1 bg-bg outline-none"
              >
                <option value="">選択してください</option>
                <option value="OUT">OUT（アウトスタート）</option>
                <option value="IN">IN（インスタート）</option>
                <option value="__free__">自由記入</option>
              </select>
            </div>
            {showFree(g) && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-muted flex-shrink-0 w-[34px]"> </span>
                <input
                  value={g.course || ''}
                  onChange={(e) => setCourse(g.id, e.target.value)}
                  placeholder="コースを自由に入力"
                  maxLength={30}
                  className="flex-1 min-w-0 text-[12px] border-[1.5px] border-border rounded-lg px-2 py-1 bg-bg outline-none"
                />
              </div>
            )}
            {over && <div className="text-[10px] text-red-600 font-bold mb-1.5">⚠️ 人数オーバーです（{g.memberIds.length}名 / 規定{GROUP_MAX}名）</div>}
            {avoidHits(g.memberIds).map(({ a, b, mutual }) => (
              <div key={`${a}|${b}`} className="text-[11px] text-red-600 font-bold mb-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 leading-relaxed">
                ⚠️ {mutual
                  ? <>{nameOfUser(a)}さんと{nameOfUser(b)}さんは、お互いに同じ組を避けたい希望です</>
                  : <>{nameOfUser(a)}さんは、{nameOfUser(b)}さんと同じ組を避けたい希望です</>}
              </div>
            ))}
            <div className="flex flex-col gap-1.5 min-h-[40px]">
              {g.memberIds.length === 0
                ? <div className="text-[11px] text-muted px-1 py-1.5">「＋ 追加」で選ぶか、ここにドラッグ</div>
                : g.memberIds.map((id) => renderMember(id, true))}
            </div>
            {renderPairNotes(g.memberIds)}
            <button type="button" onClick={() => setPickerFor(g.id)} disabled={pool.length === 0}
              aria-label="この組に未割り当ての人を追加"
              className="w-full mt-1.5 py-2 rounded-lg border-2 border-dashed border-green text-green text-[12px] font-black bg-card disabled:opacity-30">
              ＋ 追加（未割り当て {pool.length}人）
            </button>
          </div>
          );
        })}
      </div>

      {/* 「＋ 追加」で開く、未割り当ての人の一覧。押すとその組に入る（続けて何人でも）。 */}
      {pickerFor && (() => {
        const isBack = pickerFor.startsWith('back:');
        const gid = isBack ? pickerFor.slice('back:'.length) : pickerFor;
        const list = isBack ? backPoolAll : pool;
        const arr = isBack ? groupsBack : groups;
        const gi = arr.findIndex((x) => x.id === gid);
        const g = arr[gi];
        const over = !!g && g.memberIds.length >= GROUP_MAX;
        return (
          <Portal><div className="fixed inset-0 z-[150] bg-black/45 flex items-end justify-center" onClick={() => { setPickerFor(null); setPickerShowAssigned(false); }}>
            <div className="bg-card rounded-t-2xl w-full max-w-[480px] p-4 pb-8 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[14px] font-black">組{gi + 1}{isBack ? '（後半）' : ''}に追加 <span className="text-[11px] text-sub font-bold">（{g?.memberIds.length ?? 0}/{GROUP_MAX}）</span></div>
                <button type="button" onClick={() => { setPickerFor(null); setPickerShowAssigned(false); }} className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-bold bg-bg">閉じる</button>
              </div>
              {over && <div className="text-[11px] text-red-600 font-bold mb-2">⚠️ この組は規定の{GROUP_MAX}名に達しています（入れることはできます）</div>}
              {list.length === 0 ? (
                <div className="text-[12px] text-muted py-4 text-center">{isBack ? '後半の未割り当ての人はいません' : '未割り当ての人はいません'}</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {list.map((id) => {
                    const u = userOf(id);
                    return (
                      <button key={id} type="button" onClick={() => moveMember(id, isBack ? `back:${gid}` : gid)}
                        className="flex items-center gap-2 bg-bg border border-border rounded-[10px] px-2.5 py-2.5 text-[13px] font-bold text-left">
                        {u
                          ? <Avatar user={u} size={24} emojiSize={12} />
                          : <span className="w-[24px] h-[24px] rounded-full bg-card border border-border flex items-center justify-center text-[12px]">👤</span>}
                        <span className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate min-w-0 max-w-full">{nameOf(id)}</span>
                          {metaOf(id) && <span className="text-[10px] text-muted font-normal">（{metaOf(id)}）</span>}
                          {isGuest(id) && <span className="text-[9px] font-bold text-sub bg-card border border-border rounded px-1 flex-shrink-0">ゲスト</span>}
                        </span>
                        <span className="text-green font-black text-[12px] flex-shrink-0">＋ 入れる</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* ほかの組に入っている人。開いたときだけ出す。選ぶと元の組から抜けてこの組へ */}
              {(() => {
                const others = arr.filter((x) => x.id !== gid).flatMap((x, xi) => x.memberIds.map((id) => ({ id, label: `組${arr.findIndex((y) => y.id === x.id) + 1}` })));
                if (others.length === 0) return null;
                return (
                  <div className="mt-3">
                    <button type="button" onClick={() => setPickerShowAssigned((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card text-[12px] font-bold text-sub">
                      <span>ほかの組に入っている人から選ぶ（{others.length}人）</span>
                      <span>{pickerShowAssigned ? '▴' : '▾'}</span>
                    </button>
                    {pickerShowAssigned && (
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        {others.map(({ id, label }) => {
                          const u = userOf(id);
                          return (
                            <button key={id} type="button" onClick={() => moveMember(id, isBack ? `back:${gid}` : gid)}
                              className="flex items-center gap-2 bg-card border border-dashed border-border rounded-[10px] px-2.5 py-2.5 text-[13px] font-bold text-left">
                              {u
                                ? <Avatar user={u} size={24} emojiSize={12} />
                                : <span className="w-[24px] h-[24px] rounded-full bg-bg border border-border flex items-center justify-center text-[12px]">👤</span>}
                              <span className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                                <span className="truncate min-w-0 max-w-full">{nameOf(id)}</span>
                                <span className="text-[9px] font-bold text-blue bg-blue-light border border-blue rounded px-1 flex-shrink-0">{label}</span>
                                {isGuest(id) && <span className="text-[9px] font-bold text-sub bg-bg border border-border rounded px-1 flex-shrink-0">ゲスト</span>}
                              </span>
                              <span className="text-green font-black text-[12px] flex-shrink-0">→ 移す</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div></Portal>
        );
      })()}

      {/* ── 後半の組（前半と入れ替える場合だけ） ──
          「入れ替えあり」にした瞬間に前半をコピーする。後半の盤は後半の組の間だけで動かせる。
          前半で組にいるのに後半のどこにもいない人は「後半の未割り当て」に出る。 */}
      <div className="border-2 border-dashed border-border rounded-xl p-2.5 mt-3 bg-card">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={backOn} className="accent-[#2A8C82] w-4 h-4"
            onChange={(e) => {
              const on = e.target.checked;
              setBackOn(on);
              if (on && groupsBack.length === 0) {
                setGroupsBack(groups.map((g) => ({ id: g.id, startTime: g.startTime, course: g.course, memberIds: [...g.memberIds] })));
              }
              setDirty(true);
            }} />
          <span className="text-[13px] font-black">🔁 後半で組のメンバーを入れ替える</span>
        </label>
        <div className="text-[10px] text-muted mt-1">後半（イン／アウトの折り返し）で別の組に移る人がいるときに。前半・後半のどちらかで同じ組になった人が、お互いのレビュー対象になります。</div>

        {backOn && (() => {
          const inFront = groups.flatMap((g) => g.memberIds);
          const inBack = new Set(groupsBack.flatMap((g) => g.memberIds));
          const backPool = inFront.filter((id) => !inBack.has(id));
          return (
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-black">後半の組</span>
                <button type="button"
                  onClick={() => { setGroupsBack(groups.map((g) => ({ id: g.id, startTime: g.startTime, course: g.course, memberIds: [...g.memberIds] }))); setDirty(true); }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-border bg-bg">前半と同じに戻す</button>
              </div>
              <div className="flex flex-col gap-2">
                {groupsBack.map((g, gi) => {
                  const over = g.memberIds.length > GROUP_MAX;
                  const frontIdx = groups.findIndex((x) => x.id === g.id);
                  return (
                    <div key={g.id} data-dz={`back:${g.id}`} className={`border-2 border-dashed rounded-xl p-2.5 ${over ? 'border-red-400 bg-red-50' : 'border-border'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] font-black">組{frontIdx >= 0 ? frontIdx + 1 : gi + 1}（後半） <span className={`text-[11px] ${over ? 'text-red-600 font-bold' : 'text-muted'}`}>({g.memberIds.length}/{GROUP_MAX})</span></span>
                        <span className="text-[11px] text-sub font-bold">{g.startTime || ''}</span>
                      </div>
                      {over && <div className="text-[10px] text-red-600 font-bold mb-1.5">⚠️ 人数オーバーです（{g.memberIds.length}名 / 規定{GROUP_MAX}名）</div>}
                      {(() => {
                        const front = groups.find((x) => x.id === g.id)?.memberIds || [];
                        const stay = g.memberIds.filter((id) => front.includes(id));
                        const came = g.memberIds.filter((id) => !front.includes(id));
                        const left = front.filter((id) => !g.memberIds.includes(id));
                        if (!came.length && !left.length) return <div className="text-[10.5px] text-green font-bold mb-1.5">前半と同じメンバーです</div>;
                        return (
                          <div className="text-[10.5px] leading-relaxed mb-1.5 bg-bg rounded-lg px-2 py-1.5">
                            {stay.length > 0 && <div><span className="text-green font-black">前半で一緒だった人：</span>{stay.map(nameOf).join('・')}</div>}
                            {came.length > 0 && <div><span className="text-orange font-black">入れ替えで来る人：</span>{came.map((id) => `${nameOf(id)}（前半${frontIdxOf(id) + 1}組）`).join('・')}</div>}
                            {left.length > 0 && <div><span className="text-sub font-black">別の組へ行く人：</span>{left.map((id) => { const bi = backIdxOf(id); const bfi = bi >= 0 ? groups.findIndex((x) => x.id === groupsBack[bi].id) : -1; return `${nameOf(id)}${bi >= 0 ? `（後半${(bfi >= 0 ? bfi : bi) + 1}組へ）` : '（未割り当て）'}`; }).join('・')}</div>}
                          </div>
                        );
                      })()}
                      {avoidHits(g.memberIds).map(({ a, b, mutual }) => (
                        <div key={`${a}|${b}`} className="text-[11px] text-red-600 font-bold mb-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 leading-relaxed">
                          ⚠️ {mutual
                            ? <>{nameOfUser(a)}さんと{nameOfUser(b)}さんは、お互いに同じ組を避けたい希望です</>
                            : <>{nameOfUser(a)}さんは、{nameOfUser(b)}さんと同じ組を避けたい希望です</>}
                        </div>
                      ))}
                      <div className="flex flex-col gap-1.5 min-h-[40px]">
                        {g.memberIds.length === 0
                          ? <div className="text-[11px] text-muted px-1 py-1.5">「＋ 追加」で選ぶか、ここにドラッグ</div>
                          : g.memberIds.map((id) => renderMember(id, true, false, 'back', g.id))}
                      </div>
                      {renderPairNotes(g.memberIds)}
                      <button type="button" onClick={() => setPickerFor(`back:${g.id}`)} disabled={backPoolAll.length === 0}
                        aria-label="この組（後半）に未割り当ての人を追加"
                        className="w-full mt-1.5 py-2 rounded-lg border-2 border-dashed border-green text-green text-[12px] font-black bg-card disabled:opacity-30">
                        ＋ 追加（後半の未割り当て {backPoolAll.length}人）
                      </button>
                    </div>
                  );
                })}
              </div>
              <div data-dz="backpool" className="border-2 border-dashed border-hair rounded-xl p-2.5 mt-2">
                <div className="text-[11px] font-black text-sub mb-1.5">後半の未割り当て（前半にいる人で、後半の組がまだの人）</div>
                <div className="flex flex-col gap-1.5 min-h-[32px]">
                  {backPool.length === 0
                    ? <div className="text-[11px] text-muted px-1 py-1">全員、後半の組に入っています</div>
                    : backPool.map((id) => renderMember(id, false, false, 'back'))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ゲスト（ゴルトモ未登録）追加 */}
      <div className="border border-border rounded-xl p-2.5 mt-2.5 bg-card">
        <div className="text-[13px] font-black mb-1.5">👤 ゲストを追加 <span className="text-[10px] text-muted font-normal">（ゴルトモ未登録の人）</span></div>
        <div className="text-[10px] text-sub mb-1.5">追加した人は「主催者の知り合い」として1席に数えます（募集人数が1つ増えます）。あとでゴルトモに登録したら「登録者に置換」で本人に付け替えられ、人数は変わりません。</div>
        <div className="flex gap-1.5 mb-1.5">
          {([['male', '👨 男性'], ['female', '👩 女性']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setGuestGender(v)}
              className={'px-3 py-1.5 rounded-lg text-xs font-bold border-[1.5px] ' + (guestGender === v ? 'bg-green text-white border-green' : 'bg-bg text-sub border-border')}>
              {label}
            </button>
          ))}
        </div>
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
                {g.gender === 'female' ? '👩' : g.gender === 'male' ? '👨' : '👤'} {g.name}
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
          : <div className="flex flex-wrap gap-1.5">{pool.map((id) => renderMember(id))}</div>}
      </div>

      {/* 当日来れなかった人（除外） */}
      <div data-dz="noshow" className="border border-dashed border-[#d8ccc0] bg-[#faf7f2] rounded-xl p-2.5 mt-2.5">
        <div className="text-[13px] font-black mb-0.5 text-sub">🚫 当日来れなかった人 <span className="text-[11px] text-muted">({noShow.length}人)</span></div>
        <div className="text-[10px] text-muted mb-1.5">当日ドタキャン等でここに移すと、組が無くてもOK・レビュー対象からも外れます。</div>
        {noShow.length === 0
          ? <div className="text-[11px] text-muted px-1 py-1">来れなかった人をここにドラッグ</div>
          : <div className="flex flex-wrap gap-1.5">{noShow.map((id) => renderMember(id, false, true))}</div>}
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

// ゴルフ場に送る組分けテキスト（主催者だけ）。コピー or テキストファイルで保存（2026-10-08）
// 組分けを A4 縦の画像に描く（コンビニのコピー機で印刷する用。2026-10-10）
function drawCourseSheet(sheet: any): string {
  const W = 1654, H = 2339, M = 90;   // A4 縦・200dpi
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  const FONT = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
  const groupsAll = sheet.sections.flatMap((s: any) => s.groups);
  const maxMembers = Math.max(4, ...groupsAll.map((g: any) => g.members.length));
  const cols = 2;
  const rowsBySection = sheet.sections.map((s: any) => Math.ceil(s.groups.length / cols));
  const totalRows = rowsBySection.reduce((a: number, b: number) => a + b, 0) + (sheet.unassigned.length ? 1 : 0);
  // 1行（1組の箱）の高さを、全部が1枚に収まるように決める
  const headerH = 230, sectionHeadH = 80 * sheet.sections.filter((s: any) => s.head).length;
  const avail = H - M * 2 - headerH - sectionHeadH;
  const boxH = Math.min(70 + maxMembers * 64, Math.floor(avail / Math.max(1, totalRows)) - 24);
  const lineH = Math.max(30, Math.floor((boxH - 70) / maxMembers));
  const fs = Math.min(44, Math.floor(lineH * 0.72));
  let y = M;
  x.fillStyle = '#111'; x.font = `bold 64px ${FONT}`; x.fillText(sheet.title, M, y + 60);
  x.font = `bold 40px ${FONT}`; x.fillStyle = '#333'; x.fillText([sheet.sub, sheet.count].filter(Boolean).join('　'), M, y + 130);
  x.strokeStyle = '#111'; x.lineWidth = 4; x.beginPath(); x.moveTo(M, y + 170); x.lineTo(W - M, y + 170); x.stroke();
  y += headerH;
  const colW = (W - M * 2 - 40) / cols;
  for (const sec of sheet.sections) {
    if (sec.head) { x.fillStyle = '#111'; x.font = `bold 46px ${FONT}`; x.fillText(`■ ${sec.head}`, M, y + 50); y += 80; }
    sec.groups.forEach((g: any, i: number) => {
      const col = i % cols; const row = Math.floor(i / cols);
      const bx = M + col * (colW + 40); const by = y + row * (boxH + 24);
      x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(bx, by, colW, boxH);
      x.fillStyle = '#eeeeee'; x.fillRect(bx + 2, by + 2, colW - 4, 60);
      x.fillStyle = '#111'; x.font = `bold 38px ${FONT}`; x.fillText(g.label, bx + 20, by + 45);
      x.font = `${fs}px ${FONT}`;
      (g.members.length ? g.members : ['（未定）']).forEach((m: string, k: number) => {
        x.fillText(m, bx + 30, by + 62 + lineH * (k + 1) - Math.floor((lineH - fs) / 2));
      });
    });
    y += Math.ceil(sec.groups.length / cols) * (boxH + 24) + 10;
  }
  if (sheet.unassigned.length) {
    x.fillStyle = '#111'; x.font = `bold 40px ${FONT}`; x.fillText(`■ 未割り当て：${sheet.unassigned.join('、')}`, M, Math.min(y + 50, H - M));
  }
  return c.toDataURL('image/png');
}

function GolfCourseExport({ text, sheet, onClose, dirty, roundId }: { text: string; sheet: any; onClose: () => void; dirty: boolean; roundId: string }) {
  const [img, setImg] = useState('');
  // 画像で保存（2026-10-10 直し）：LINE の中のブラウザはダウンロードができないため、
  //   ① 共有シート（「画像を保存」「プリント」が選べる）→ ② LINE の中なら外部ブラウザで画像を開く → ③ PC はそのままダウンロード
  const [saving, setSaving] = useState(false);
  async function makeImage() {
    if (saving) return;
    setSaving(true);
    try {
      const url = drawCourseSheet(sheet);
      setImg(url);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], '組分け.png', { type: 'image/png' });
      const inLine = /Line\//i.test(navigator.userAgent);
      const nav = navigator as any;
      if (!inLine && nav.canShare && nav.canShare({ files: [file] })) {
        try { await nav.share({ files: [file], title: '組分け' }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
      }
      if (inLine || /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        const res = await fetch(`/api/rounds/${roundId}/course-sheet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ dataUrl: url }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.url) throw new Error('upload');
        // LINE のブラウザは ?openExternalBrowser=1 を付けると Safari / Chrome で開く
        window.location.href = `${j.url}${inLine ? '?openExternalBrowser=1' : ''}`;
        toast('ブラウザで画像を開きます。長押しで「写真に保存」できます');
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = objUrl; a.download = '組分け.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
      toast('画像を保存しました');
    } catch { toast('画像を保存できませんでした。下の画像を長押しして保存してください', 'error'); }
    finally { setSaving(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); toast('コピーしました'); }
    catch { toast('コピーできませんでした。下の文章を長押ししてコピーしてください', 'error'); }
  }
  function download() {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '組分け.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { toast('保存できませんでした。コピーを使ってください', 'error'); }
  }
  // 前半・後半の両方に出る人を二重に数えない
  const missing = new Set(text.split(String.fromCharCode(10)).map((l) => l.trim()).filter((l) => l.endsWith('（本名未登録）'))).size;
  return (
    <Portal>
      <div className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center" onClick={onClose}>
        <div className="w-full max-w-[430px] bg-card rounded-t-2xl p-4 max-h-[85vh] flex flex-col overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center mb-1">
            <div className="text-[14px] font-black flex-1">📄 ゴルフ場に送る組分けテキスト</div>
            <button onClick={onClose} className="text-sub text-[18px] px-2" aria-label="閉じる">×</button>
          </div>
          <div className="text-[11px] text-sub leading-relaxed mb-2">
            本名（姓 名）で出しています。主催者だけが見られます。{dirty ? '⚠️ まだ保存していない変更も含みます。' : ''}
            {missing > 0 ? `本名が未登録の人が${missing}人います（表示名で出しています）。` : ''}
          </div>
          <textarea readOnly value={text} className="flex-1 min-h-[220px] w-full text-[12px] leading-relaxed border-[1.5px] border-border rounded-xl px-3 py-2.5 bg-bg font-mono" />
          <div className="flex gap-2 mt-3">
            <button onClick={copy} className="flex-1 py-3 rounded-xl bg-green text-white text-sm font-black">📋 コピー</button>
            <button onClick={download} className="flex-1 py-3 rounded-xl bg-card border-[1.5px] border-border text-sub text-sm font-bold">💾 テキストで保存</button>
          </div>
          <button onClick={makeImage} disabled={saving} className="w-full mt-2 py-3 rounded-xl bg-orange text-white text-sm font-black disabled:opacity-60">{saving ? '画像を作っています…' : '🖼 画像で保存（印刷用・A4）'}</button>
          {img && (
            <div className="mt-2">
              <div className="text-[11px] text-sub mb-1">保存されない場合は、下の画像を長押しして「写真に保存」してください。コンビニのコピー機の「写真プリント／ネットプリント」で A4 印刷できます。</div>
              <img src={img} alt="組分け（印刷用）" className="w-full border border-border rounded-lg" />
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
