import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// POST /api/timeline/view { viewId, phase: 'start' | 'end', ms? } … タイムラインを見た記録（2026-10-17・管理画面の計測用）。
//   start … タイムラインを開いた（_timelineViews/{viewId} = { userId, startAt, day(JST), test }）
//   end   … 閉じた・ほかの画面に移った・アプリを閉じた（durationMs＝見ていた時間・30分で頭打ち）
// navigator.sendBeacon からも呼ぶので、本文は text/plain の JSON でも読む。
const noStore = { 'Cache-Control': 'no-store' };
const MAX_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = JSON.parse(await req.text()) || {}; } catch { /* noop */ }
  const viewId = String(body.viewId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!viewId) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ ok: false }, { headers: noStore });
  const ref = adb.collection('_timelineViews').doc(`${meId.slice(-12)}_${viewId}`);
  const now = Date.now();
  if (body.phase === 'end') {
    const ms = Math.max(0, Math.min(MAX_MS, Math.floor(Number(body.ms) || 0)));
    const cur = await ref.get();
    if (cur.exists && (cur.data()?.userId === meId)) await ref.set({ durationMs: Math.max(ms, Number(cur.data()?.durationMs || 0)), endAt: now }, { merge: true });
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  let test = meId.startsWith('test_');
  try { const { isTestAccount } = await import('@/lib/testAccounts'); test = test || (await isTestAccount(meId)); } catch { /* noop */ }
  const day = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await ref.set({ userId: meId, startAt: now, day, test, durationMs: 0 }, { merge: true });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
