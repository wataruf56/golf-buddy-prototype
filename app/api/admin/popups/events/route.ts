import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { warmTestIds, isTestId } from '@/lib/testAccounts';
import { popupDef } from '@/lib/popupCatalog';

// GET /api/admin/popups/events?token=XXX … ポップアップの記録をさがす（2026-11-01・管理画面「🪟 ポップアップ」）
//   days=30（1〜180） popup=<id> action=<action|show> q=<名前の一部 or ユーザーID> test=1（テスト垢も含める）
// 新しい順に最大 300 件。1件＝誰が・いつ・どのポップアップで・何をしたか・どの画面で。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const DAY = 86400000;
const LIMIT = 300;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || url.searchParams.get('token') !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days') || 30)));
  const popup = url.searchParams.get('popup') || '';
  const action = url.searchParams.get('action') || '';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const includeTest = url.searchParams.get('test') === '1';
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  await warmTestIds().catch(() => {});

  type Ev = { userId: string; popup: string; action: string; ts: number; page?: string; extra?: Record<string, unknown> };
  let events: Ev[] = [];
  try {
    const snap = await adb.collection('_popupEvents').where('ts', '>=', Date.now() - days * DAY).limit(50000).get();
    events = snap.docs.map((d: any) => d.data() as Ev)
      .filter((e: Ev) => e.popup && e.action && (includeTest || !isTestId(e.userId)))
      .filter((e: Ev) => (!popup || e.popup === popup) && (!action || e.action === action));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  events.sort((a, b) => b.ts - a.ts);

  // 名前で絞るときは、出てきた人の名前を先に引いてから絞る
  const users: Record<string, { name: string; gender?: string; age?: number }> = {};
  const loadUsers = async (ids: string[]) => {
    const need = ids.filter((id) => id && !users[id]);
    for (let i = 0; i < need.length; i += 100) {
      const refs = need.slice(i, i + 100).map((id) => adb.collection('users').doc(id));
      const snaps = refs.length ? await adb.getAll(...refs) : [];
      for (const sn of snaps) {
        const d = sn.exists ? sn.data() || {} : null;
        users[sn.id] = d ? { name: d.displayName || '（名前なし）', gender: d.gender || '', age: d.age || 0 } : { name: '（退会・不明）' };
      }
    }
  };
  let matched = events;
  if (q) {
    await loadUsers(Array.from(new Set(events.map((e) => e.userId))));
    matched = events.filter((e) => e.userId.toLowerCase().includes(q) || (users[e.userId]?.name || '').toLowerCase().includes(q));
  }
  const rows = matched.slice(0, LIMIT);
  await loadUsers(Array.from(new Set(rows.map((e) => e.userId))));
  return NextResponse.json({
    total: matched.length,
    rows: rows.map((e) => {
      const def = popupDef(e.popup);
      return {
        ts: e.ts, userId: e.userId, user: users[e.userId] || { name: '（退会・不明）' },
        popup: e.popup, popupName: def?.name || e.popup, emoji: def?.emoji || '🪟',
        action: e.action, actionLabel: e.action === 'show' ? '出た' : (def?.actions?.[e.action] || e.action),
        goal: !!def?.goal.includes(e.action), page: e.page || '', extra: e.extra || null,
      };
    }),
  }, { headers: noStore });
}
