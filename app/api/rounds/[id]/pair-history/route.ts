import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { getAdminDb } from '@/lib/firebase';
import { isSameGroup, registeredParticipantIds, isNoShow } from '@/lib/groups';
import type { Round } from '@/lib/types';

// GET /api/rounds/[id]/pair-history … 主催者だけ（2026-10-08）
// この募集の参加者どうしが、過去の完了したラウンドで
//   sameGroup … 同じ組で回った回数（コンペでない募集は全員同じ組として数える）
//   sameEvent … 同じコンペに出たが別の組だった回数
// を返す。組み分け画面で「過去に同組◯回」などを出し、主催者が組を決める参考にする。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const people = new Set(registeredParticipantIds(round));
  const pairs: Record<string, { sameGroup: number; sameEvent: number }> = {};
  const adb = getAdminDb() as any;
  if (!adb || people.size < 2) return NextResponse.json({ pairs }, { headers: noStore });

  const snap = await adb.collection('rounds').where('status', '==', 'completed').limit(3000).get();
  for (const d of snap.docs) {
    if (d.id === round.id) continue;
    const r = { id: d.id, ...d.data() } as Round;
    if ((r as any).availDate) continue;   // 行ける日の部屋は除く
    const here = registeredParticipantIds(r).filter((id) => people.has(id) && !isNoShow(r, id));
    if (here.length < 2) continue;
    for (let i = 0; i < here.length; i++) {
      for (let j = i + 1; j < here.length; j++) {
        const a = here[i], b = here[j];
        const k = key(a, b);
        const p = pairs[k] || (pairs[k] = { sameGroup: 0, sameEvent: 0 });
        // 組が決まっていないコンペは「同じコンペに出た」だけ数える
        const hasGroups = (r.groups || []).length > 0;
        if (!r.isCompetition || (hasGroups && isSameGroup(r, a, b))) p.sameGroup += 1;
        else p.sameEvent += 1;
      }
    }
  }
  return NextResponse.json({ pairs }, { headers: noStore });
}
