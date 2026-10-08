import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort, viewCohort } from './ageGate';
import type { User } from './types';

// タイムライン（2026-10-08）：みんなの動きを LINE のシステムメッセージ風に1行ずつ。
//   signup … 「◯◯さんがゴルトモに登録しました」（1人1行）
//   avail  … 「◯◯さんが行ける日を入力しました」（1人1行。何度入力しても最新の1行だけ）
//   round  … 「◯◯さんがラウンド募集を開始しました」（募集ごとに1行）
// 新しく記録を書くのではなく、users / _availability / rounds から毎回組み立てる（重複がそもそも起きない）。
// 誰にも通知はしない。見えるのは同じ年代（コホート）の動きだけ。テスト垢・赤バン・退会者は出さない。
// 「行ける日」は lib/availability と同じく男性には名前を出さない（女性を日付で特定できないように）。

export type TimelineItem = {
  id: string;
  kind: 'signup' | 'avail' | 'round';
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

  const [usersSnap, availSnap, roundsSnap, banned, testCfg] = await Promise.all([
    adb.collection('users').where('createdAt', '>=', since).limit(500).get().catch(() => ({ docs: [] })),
    adb.collection('_availability').where('updatedAt', '>=', since).limit(1000).get().catch(() => ({ docs: [] })),
    adb.collection('rounds').where('createdAt', '>=', since).limit(500).get().catch(() => ({ docs: [] })),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
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
  const ids = Array.from(need);
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => adb.collection('users').doc(id));
    const snaps = refs.length ? await adb.getAll(...refs) : [];
    for (const s of snaps) if (s.exists) userMap.set(s.id, { id: s.id, ...s.data() });
  }
  const sameCohort = (u: any) => !!u && getCohort(u.age) === cohort;
  const nameOf = (u: any) => String(u?.displayName || 'メンバー').slice(0, 20);
  const viewerIsFemale = viewer.gender === 'female';

  const items: TimelineItem[] = [];
  for (const d of usersSnap.docs) {
    const u = userMap.get(d.id);
    if (hidden(d.id) || !sameCohort(u) || u?.banned || !u?.createdAt) continue;
    items.push({ id: `signup_${d.id}`, kind: 'signup', at: u.createdAt, name: nameOf(u), text: 'さんがゴルトモに登録しました' });
  }
  for (const d of availSnap.docs) {
    const a = d.data() || {};
    const u = userMap.get(d.id);
    if (hidden(d.id) || !sameCohort(u) || u?.banned) continue;
    if (!Array.isArray(a.dates) || !a.dates.length || !a.updatedAt) continue;
    const name = viewerIsFemale || d.id === viewer.id ? nameOf(u) : (u?.gender === 'female' ? '女性メンバー' : u?.gender === 'male' ? '男性メンバー' : 'メンバー');
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
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}
