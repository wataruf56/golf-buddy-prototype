import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store' };

// POST /api/rounds/[id]/view
// 「この募集を見に来た」ことを静かに記録する（通知はしない）。主催者だけが後で
// /api/rounds/[id]/viewers で「誰がいつ見に来たか」を確認できる。
// - 未ログインは記録しない（no-op で 200 を返す。閲覧自体はログイン不要のため）。
// - 主催者本人の閲覧は記録しない（自分の投稿を開いても意味がない）。
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  // 未ログインでも募集は閲覧できる。記録だけスキップしてエラーにはしない。
  if (!meId) return NextResponse.json({ ok: true, recorded: false }, { headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  // 主催者本人は記録しない。
  if (isRoundHost(round, meId)) return NextResponse.json({ ok: true, recorded: false, self: true }, { headers: noStore });

  try {
    await db.recordRoundView(params.id, meId, Date.now());
  } catch {
    // 記録失敗は致命的ではない（閲覧体験を止めない）。
    return NextResponse.json({ ok: true, recorded: false }, { headers: noStore });
  }
  return NextResponse.json({ ok: true, recorded: true }, { headers: noStore });
}
