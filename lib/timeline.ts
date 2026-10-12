import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort, viewCohort } from './ageGate';
import type { User } from './types';

// タイムライン（2026-10-08）：みんなの動きを LINE のシステムメッセージ風に1行ずつ。
//   signup … 「◯◯さんがゴルトモに登録しました」（1人1行）。この30日に入った新しい会員だけ（前からの会員がプロフィールを
//            直しても「登録」とは出さない）。時刻はプロフィールを登録した時（profileCompletedAt・無ければ createdAt）（2026-10-12）。
//            LINEで入っただけで年齢が未入力の人は出さない（年代が決まらない）→ 入力した時点で、その時刻で出る
//   avail  … 「◯◯さんが行ける日を入力しました」（1人1行。何度入力しても最新の1行だけ）
//   round  … 「◯◯さんがラウンド募集を開始しました」（募集ごとに1行）
//   join   … 「◯◯さんが「…」に参加しました」（参加が確定した人だけ。_timelineEvents・lib/timelineEvents）（2026-10-12）
//            いまも参加している人だけ出す（取りやめ・除外されたら消える）。行ける日の部屋・運営の代理募集（そろうまで顔ぶれを伏せる枠）は出さない
// 新しく記録を書くのではなく、users / _availability / rounds から毎回組み立てる（重複がそもそも起きない）。
// 誰にも通知はしない。見えるのは同じ年代（コホート）の動きだけ。テスト垢・赤バン・退会者は出さない。
// 「行ける日」は lib/availability と同じく男性には名前を出さない（女性を日付で特定できないように）。

export type TimelineItem = {
  id: string;
  kind: 'signup' | 'avail' | 'round' | 'join';
  at: number;
  name: string;
  text: string;
  sub?: string;
  link?: string;
};

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function dateLabel(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日月火水木金土'[dt.getDay()]}）`;
}

export async function buildTimeline(viewer: User, limit = 80): Promise<TimelineItem[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  const cohort = viewCohort(viewer.age);   // 年齢未入力の新規会員も20〜30代として見られる
  if (!cohort) return [];
  const since = Date.now() - WINDOW_MS;

  const [usersSnap, availSnap, roundsSnap, banned, testCfg, joinSnap] = await Promise.all([
    adb.collection('users').where('createdAt', '>=', since).limit(500).get().catch(() => ({ docs: [] })),
    adb.collection('_availability').where('updatedAt', '>=', since).limit(1000).get().catch(() => ({ docs: [] })),
    adb.collection('rounds').where('createdAt', '>=', since).limit(500).get().catch(() => ({ docs: [] })),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
    adb.collection('_timelineEvents').where('at', '>=', since).limit(1000).get().catch(() => ({ docs: [] })),
  ]);
  const testIds = new Set<string>((testCfg?.accounts || []).map((a: any) => a.id));
  const viewerIsTest = viewer.id.startsWith('test_') || testIds.has(viewer.id);
  const hidden = (id: string) => !id || banned.has(id) || (!viewerIsTest && (id.startsWith('test_') || testIds.has(id)));

  // 名前・年代を引くための会員表（新規登録者＋行ける日の人＋主催者）
  const userMap = new Map<string, any>();
  for (const d of usersSnap.docs) userMap.set(d.id, { id: d.id, ...d.data() });
  const need = new Set<string>();
  for (const d of availSnap.docs) if (!userMap.has(d.id)) need.add(d.id);
  for (const d of roundsSnap.docs) { const h = d.data()?.hostId; if (h && !userMap.has(h)) need.add(h); }
  const joins = joinSnap.docs.map((d: any) => d.data() || {}).filter((x: any) => x.kind === 'join' && x.roundId && x.userId);
  for (const j of joins) if (!userMap.has(j.userId)) need.add(j.userId);
  const ids = Array.from(need);
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => adb.collection('users').doc(id));
    const snaps = refs.length ? await adb.getAll(...refs) : [];
    for (const s of snaps) if (s.exists) userMap.set(s.id, { id: s.id, ...s.data() });
  }
  const sameCohort = (u: any) => !!u && getCohort(u.age) === cohort;
  const nameOf = (u: any) => String(u?.displayName || 'メンバー').slice(0, 20);
  const viewerIsFemale = viewer.gender === 'female';
  // 友達（ゴル友・お互いに選んだ相手）は男性が見ても名前を出す（2026-10-11・行ける日と同じ）
  const { availFriendSet } = await import('./availability');
  const friends = await availFriendSet(viewer as any).catch(() => new Set<string>());

  const items: TimelineItem[] = [];
  for (const d of usersSnap.docs) {
    const u = userMap.get(d.id);
    const at = Number(u?.profileCompletedAt) || Number(u?.createdAt) || 0;
    if (hidden(d.id) || !sameCohort(u) || u?.banned || !at) continue;
    items.push({ id: `signup_${d.id}`, kind: 'signup', at, name: nameOf(u), text: 'さんがゴルトモに登録しました' });
  }
  for (const d of availSnap.docs) {
    const a = d.data() || {};
    const u = userMap.get(d.id);
    if (hidden(d.id) || !sameCohort(u) || u?.banned) continue;
    if (!Array.isArray(a.dates) || !a.dates.length || !a.updatedAt) continue;
    const name = viewerIsFemale || d.id === viewer.id || friends.has(d.id) ? nameOf(u) : (u?.gender === 'female' ? '女性メンバー' : u?.gender === 'male' ? '男性メンバー' : 'メンバー');
    items.push({ id: `avail_${d.id}`, kind: 'avail', at: a.updatedAt, name, text: 'さんが行ける日を入力しました', link: '/availability' });
  }
  for (const d of roundsSnap.docs) {
    const r = d.data() || {};
    if (!r.createdAt || r.availDate) continue;               // 行ける日の部屋は除く
    const host = userMap.get(r.hostId);
    if (hidden(r.hostId)) continue;
    const rc = r.hostCohort || getCohort(host?.age);
    if (rc !== cohort) continue;
    const name = r.isOfficial ? 'ゴルトモ運営' : nameOf(host);
    const drink = r.eventType === 'drink';
    const sub = [r.title ? `「${String(r.title).slice(0, 30)}」` : '', r.date ? dateLabel(r.date) : (r.dateRange || ''), r.area || ''].filter(Boolean).join(' ');
    items.push({ id: `round_${d.id}`, kind: 'round', at: r.createdAt, name, text: drink ? 'さんが飲み会・親睦会の募集を開始しました' : 'さんがラウンド募集を開始しました', sub, link: `/round/${d.id}` });
  }
  // 参加が確定した人（その募集をまだ読んでいなければまとめて読む）
  const roundMap = new Map<string, any>();
  for (const d of roundsSnap.docs) roundMap.set(d.id, d.data() || {});
  const needRounds = Array.from(new Set(joins.map((j: any) => j.roundId).filter((id: string) => !roundMap.has(id))));
  for (let i = 0; i < needRounds.length; i += 100) {
    const refs = needRounds.slice(i, i + 100).map((id) => adb.collection('rounds').doc(id));
    const snaps = refs.length ? await adb.getAll(...refs) : [];
    for (const s of snaps) if (s.exists) roundMap.set(s.id, s.data() || {});
  }
  const { ADMIN_MANAGER_ID } = await import('./adminManagerId');
  for (const j of joins) {
    const r = roundMap.get(j.roundId);
    const u = userMap.get(j.userId);
    if (!r || !u || hidden(j.userId) || hidden(r.hostId) || u.banned) continue;
    if (r.availDate || r.hostId === ADMIN_MANAGER_ID) continue;              // 行ける日の部屋・運営の代理募集は出さない
    if (!(r.applicantIds || []).includes(j.userId)) continue;                // 取りやめた・外された
    const rc = r.hostCohort || getCohort(userMap.get(r.hostId)?.age);
    if (rc && rc !== cohort) continue;                                       // 同じ年代の募集だけ
    const sub = [r.date ? dateLabel(r.date) : (r.dateRange || ''), r.area || '', r.courseName || ''].filter(Boolean).join(' ');
    const title = String(r.title || r.courseName || (r.eventType === 'drink' ? '飲み会' : 'ラウンド')).slice(0, 30);
    items.push({ id: `join_${j.roundId}_${j.userId}`, kind: 'join', at: j.at, name: nameOf(u), text: `さんが「${title}」に参加しました`, sub, link: `/round/${j.roundId}` });
  }
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}
