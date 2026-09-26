import type { Round, CarAssignment, RoundGroup } from './types';

// 募集から人が抜けたとき（辞退・主催者の除外・申請の却下）に、その人の痕跡を
// **募集の中の全項目から**消す。
//
// 【なぜ要るか】
// 以前は applicantIds / pendingApplicantIds から外すだけだった。ところが人ごとの情報は
// 組み分け・後半の組・送迎の回答・配車・ピックアップの提案・入金・組み分け希望・
// スコア…と方々にあり、そこに残ったIDが「抜けたはずの人が組み分けや配車に出続ける」
// 不具合になっていた。1か所で列挙しておき、人ごとの項目を増やしたらここに足す。
//
// 配列は「その人を除いた配列」に置き換える。map は「そのキーを消す」。
// Firestore は merge 更新で map のキーを消せないので、db 側で FieldValue.delete() にする。

export type MemberScrub = {
  /** 置き換える配列項目（丸ごと上書きしてよい） */
  arrays: Partial<Round>;
  /** 消す map のキー：[項目名, キー] */
  deleteKeys: Array<[keyof Round & string, string]>;
  /** 書き換える map の値：[項目名, キー, 新しい値]（他の人の組み分け希望から参照を外す） */
  setKeys: Array<[keyof Round & string, string, unknown]>;
};

const scrubGroups = (gs: RoundGroup[] | undefined, uid: string): RoundGroup[] | undefined =>
  gs ? gs.map((g) => ({ ...g, memberIds: (g.memberIds || []).filter((m) => m !== uid) })) : undefined;

export function scrubMemberFromRound(data: Partial<Round>, uid: string): MemberScrub {
  const arrays: Partial<Round> = {};
  const deleteKeys: MemberScrub['deleteKeys'] = [];
  const setKeys: MemberScrub['setKeys'] = [];

  const drop = (list?: string[]) => (list ? list.filter((x) => x !== uid) : undefined);
  const changedList = (before?: string[], after?: string[]) => !!before && !!after && before.length !== after.length;

  // ── 配列 ──
  const groups = scrubGroups(data.groups, uid);
  if (groups && JSON.stringify(groups) !== JSON.stringify(data.groups)) arrays.groups = groups;
  const groupsBack = scrubGroups(data.groupsBack, uid);
  if (groupsBack && JSON.stringify(groupsBack) !== JSON.stringify(data.groupsBack)) arrays.groupsBack = groupsBack;
  for (const k of ['noShowIds', 'paidIds', 'invitedIds'] as const) {
    const after = drop(data[k]);
    if (changedList(data[k], after)) (arrays as any)[k] = after;
  }
  if (data.carAssignments) {
    const cars: CarAssignment[] = data.carAssignments
      .filter((c) => c.driverId !== uid)
      .map((c) => ({ ...c, passengerIds: (c.passengerIds || []).filter((p) => p !== uid) }));
    if (JSON.stringify(cars) !== JSON.stringify(data.carAssignments)) arrays.carAssignments = cars;
  }

  // ── map のキー ──
  for (const k of ['participantPickups', 'pickupProposals', 'scores', 'inviteMessages', 'groupPrefs'] as const) {
    const m = data[k] as Record<string, unknown> | undefined;
    if (m && Object.prototype.hasOwnProperty.call(m, uid)) deleteKeys.push([k, uid]);
  }
  // 他の人の組み分け希望（避けたい／一緒がいい）から、この人への参照を外す
  const prefs = data.groupPrefs || {};
  for (const [m, p] of Object.entries(prefs)) {
    if (m === uid || !p) continue;
    const avoid = (p.avoid || []).filter((x) => x !== uid);
    const prefer = p.prefer === uid ? undefined : p.prefer;
    if (avoid.length !== (p.avoid || []).length || prefer !== p.prefer) {
      setKeys.push(['groupPrefs', m, { ...(avoid.length ? { avoid } : {}), ...(prefer ? { prefer } : {}) }]);
    }
  }
  return { arrays, deleteKeys, setKeys };
}

/** メモリ上の Round オブジェクトに直接あてる（メモリDB・戻り値の組み立て用）。 */
export function applyScrubInPlace<T extends Partial<Round>>(r: T, s: MemberScrub): T {
  Object.assign(r, s.arrays);
  for (const [k, key] of s.deleteKeys) {
    const m = (r as any)[k];
    if (m && typeof m === 'object') delete m[key];
  }
  for (const [k, key, v] of s.setKeys) {
    const m = ((r as any)[k] = (r as any)[k] || {});
    m[key] = v;
  }
  return r;
}

/**
 * 募集の中に残っている「もう参加していない人」のIDを全部集める（掃除用）。
 * 参加している人＝主催者・共同管理者・参加確定・ゲスト。申請中の人は組み分けや配車には
 * 入らないので、そこに居たら痕跡とみなす。
 */
export function strayMemberIds(data: Partial<Round>): string[] {
  const members = new Set<string>([
    data.hostId || '', ...(data.coHostIds || []), ...(data.applicantIds || []), ...((data.guests || []).map((g) => g.id)),
  ].filter(Boolean));
  const found = new Set<string>();
  const seen = (id?: string) => { if (id && !members.has(id)) found.add(id); };
  for (const g of [...(data.groups || []), ...(data.groupsBack || [])]) (g.memberIds || []).forEach(seen);
  (data.noShowIds || []).forEach(seen);
  (data.paidIds || []).forEach(seen);
  for (const c of data.carAssignments || []) { seen(c.driverId); (c.passengerIds || []).forEach(seen); }
  Object.keys(data.participantPickups || {}).forEach(seen);
  Object.keys(data.pickupProposals || {}).forEach(seen);
  Object.keys(data.groupPrefs || {}).forEach(seen);
  for (const p of Object.values(data.groupPrefs || {})) { (p?.avoid || []).forEach(seen); seen(p?.prefer); }
  return Array.from(found);
}
