import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { webPushText } from '@/lib/webPush';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/push/test — sends a test push to the caller's own devices so they
// can verify notifications work without waiting for a real event.
export async function POST() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    await webPushText(
      meId,
      '🔔 テスト通知',
      'ゴルトモのプッシュ通知が正しく届いています！',
      '/home',
      'test-push',
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
