import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/notifications/read — mark the in-app お知らせ inbox as read up to now.
// Stores a single timestamp on the user; unread = notification.createdAt > it.
export async function POST() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    await db.updateUser(meId, { notifReadAt: Date.now() });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
