import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store' };
const MAX = 200; // 返す閲覧者の上限（最新順）。

// GET /api/rounds/[id]/viewers  ★主催者限定★
// この募集を「見に来た人」の一覧を、最終閲覧時刻の新しい順で返す。
// viewedBy はここでしか外に出さない（bootstrap/単体GETでは必ず strip 済み）。
// 返すユーザー情報は公開項目のみ（本名は落とす）。赤バンされた人は除外する。
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ閲覧できます' }, { status: 403, headers: noStore });
  }

  const viewedBy = round.viewedBy || {};
  // 主催者本人が万一混ざっていても除外。最終閲覧時刻の降順に並べる。
  let entries = Object.entries(viewedBy)
    .filter(([id]) => id && id !== meId)
    .map(([id, v]) => ({ id, at: v?.at || 0, count: v?.count || 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX);

  if (entries.length === 0) return NextResponse.json({ viewers: [] }, { headers: noStore });

  // 赤バンユーザーは一覧から除外（他機能と同様、存在を見せない）。
  try {
    const { getBannedIdSet } = await import('@/lib/banAccess');
    const bset = await getBannedIdSet();
    if (bset.size) entries = entries.filter((e) => !bset.has(e.id));
  } catch { /* 判定不能時はそのまま */ }

  const users = await db.listUsers(entries.map((e) => e.id));
  const { stripPrivateMany } = await import('@/lib/sanitizeUser');
  const safe = stripPrivateMany(users, null);
  const byId = new Map(safe.map((u) => [u.id, u]));

  const viewers = entries
    .map((e) => {
      const user = byId.get(e.id);
      if (!user) return null; // ユーザーが見つからない（削除済み等）は落とす。
      return { user, at: e.at, count: e.count };
    })
    .filter(Boolean);

  return NextResponse.json({ viewers }, { headers: noStore });
}
