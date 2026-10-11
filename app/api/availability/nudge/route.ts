import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { chatIdFor } from '@/lib/utils';
import { availFriendSet, getAvailability } from '@/lib/availability';
import { dateLabel } from '@/lib/availabilityShared';

// 「行ける日」で声をかける（2026-10-11・components/AvailNudgeBox）
//   GET  ?toUserId= … その相手にもう送った日 { sentDates }
//   POST { toUserId, dates[] } … 自分の「行ける日」から選んだ日を、相手にDMで「この日、入れてみませんか？」
// 送れる相手＝友達（ゴル友・お互いに「行きたい／回ってみたい」を選んだ相手・lib/availability.availFriendSet）。
// 送れる日＝自分が「行ける日」に入れている日だけ。同じ相手に同じ日は1回だけ（_availNudges/{from__to}）。
const noStore = { 'Cache-Control': 'no-store' };
const COLL = '_availNudges';
const docId = (a: string, b: string) => `${a}__${b}`;

async function sentDatesOf(from: string, to: string): Promise<string[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try { const s = await adb.collection(COLL).doc(docId(from, to)).get(); return s.exists ? (s.data()?.dates || []) : []; } catch { return []; }
}

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const to = new URL(req.url).searchParams.get('toUserId') || '';
  return NextResponse.json({ sentDates: to ? await sentDatesOf(meId, to) : [] }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const to = String(body.toUserId || '');
  const me = await db.getUser(meId);
  const other = to ? await db.getUser(to) : null;
  if (!me || !other || to === meId) return NextResponse.json({ error: 'bad_request', message: '相手が正しくありません' }, { status: 400, headers: noStore });
  if (!(await availFriendSet(me)).has(to)) {
    return NextResponse.json({ error: 'not_friend', message: '声をかけられるのは、友達（お互いに「行きたい」を選んだ相手・ゴル友）だけです' }, { status: 403, headers: noStore });
  }
  const mine = (await getAvailability(meId))?.dates || [];
  const already = await sentDatesOf(meId, to);
  const dates = Array.from(new Set<string>((Array.isArray(body.dates) ? body.dates : []).map((x: unknown) => String(x))))
    .filter((d) => mine.includes(d) && !already.includes(d)).sort().slice(0, 30);
  if (!dates.length) return NextResponse.json({ error: 'no_dates', message: '送れる日がありません（行ける日に入れている日・まだ送っていない日だけ送れます）' }, { status: 400, headers: noStore });

  const lines = dates.map((d) => { const l = dateLabel(d); return `・${l.md}（${l.w}）`; }).join('\n');
  const text = `📅 行ける日の声かけ\n${me.displayName || 'メンバー'}さんは、この日にゴルフに行けるそうです。\n${lines}\n\n${other.displayName || ''}さんも行けそうなら、「行ける日」に入れてみませんか？同じ日に3人集まると、その日のチャットが始まります。\nhttps://app.goltomo.com/availability`;
  const chatId = chatIdFor(meId, to);
  await db.sendMessage(chatId, [meId, to].sort() as [string, string], meId, text);
  const adb = getAdminDb() as any;
  if (adb) await adb.collection(COLL).doc(docId(meId, to)).set({ from: meId, to, dates: [...already, ...dates], at: Date.now() }, { merge: true });

  const link = `/chat/${chatId}?other=${meId}`;
  try {
    const { addNotification } = await import('@/lib/notifications');
    await addNotification(to, 'dm', `📅 ${me.displayName || 'メンバー'}さんから「行ける日」の声かけが届きました`, link);
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    if (isNotifyEnabled(other as any, 'dm')) {
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      await pushTo(to, `📅 ${me.displayName || 'メンバー'}さんから「行ける日」の声かけが届きました（${dates.length}日）`, liffUrl(link), 'avail_friend_nudge');
    }
  } catch { /* noop */ }
  return NextResponse.json({ ok: true, dates }, { headers: noStore });
}
