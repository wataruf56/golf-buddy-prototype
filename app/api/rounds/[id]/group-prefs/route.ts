import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// コンペの組み分け希望。参加者本人が「同じ組は避けたい人（最大2）」「一緒だと嬉しい人（最大1）」を
// 保存する。保存できるのはそのラウンドの参加者（主催者＋承認済み）だけ。集計の閲覧は主催者のみ
// （GET は主催者限定で全員ぶんを返す）。
const noStore = { 'Cache-Control': 'no-store' };
const MAX_AVOID = 2;

function participantSet(round: any): Set<string> {
  return new Set<string>([round.hostId, ...((round.applicantIds as string[]) || [])].filter(Boolean));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const members = participantSet(round);
  if (!members.has(meId)) {
    return NextResponse.json({ error: 'forbidden', message: 'このラウンドの参加者のみ設定できます' }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}

  // 自分以外の参加者のみ選択可。avoid は最大2、prefer は1人。重複や自分は除外。
  const clampIds = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      const id = String(x || '');
      if (id && id !== meId && members.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };
  const avoid = clampIds(body.avoid).slice(0, MAX_AVOID);
  let prefer: string | undefined = String(body.prefer || '') || undefined;
  if (prefer && (prefer === meId || !members.has(prefer) || avoid.includes(prefer))) prefer = undefined;

  const groupPrefs = { ...(round.groupPrefs || {}) } as Record<string, { avoid?: string[]; prefer?: string }>;
  if (avoid.length === 0 && !prefer) {
    delete groupPrefs[meId];
  } else {
    groupPrefs[meId] = { avoid, ...(prefer ? { prefer } : {}) };
  }

  try {
    await db.updateRound(params.id, { groupPrefs } as any);
    return NextResponse.json({ ok: true, mine: groupPrefs[meId] || null }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
