import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/openchat { url }
// Host-only. Sets (or clears, with empty url) the LINE Open Chat URL shown at
// the top of the round group chat.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ設定できます' }, { status: 403, headers: noStore });
  }

  let url = '';
  try { url = String((await req.json())?.url || '').trim(); } catch {}
  // Allow clearing; otherwise require a valid http(s) URL (LINE open chat links
  // are https://line.me/ti/g2/... or https://line.me/R/...).
  if (url) {
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500) {
      return NextResponse.json({ error: 'invalid_url', message: '正しいURLを入力してください' }, { status: 400, headers: noStore });
    }
  }

  await db.updateRound(params.id, { openChatUrl: url || ('' as any) } as any);
  return NextResponse.json({ ok: true, openChatUrl: url }, { headers: noStore });
}
