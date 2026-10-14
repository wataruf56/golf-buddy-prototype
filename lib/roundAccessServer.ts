import 'server-only';
import { NextResponse } from 'next/server';
import { canViewRound, PRIVATE_ROUND_MESSAGE } from './roundAccess';
import { isAdminUserId } from './adminAccess';

/** 非公開の招待を、見られない人が触ろうとしたら 403 を返す（見られるなら null）。各 /api/rounds/[id]/* の入口で使う（2026-10-14）。 */
export function privateRoundGuard(round: any, viewerId: string | null | undefined): NextResponse | null {
  if (!round || canViewRound(round, viewerId, isAdminUserId(viewerId))) return null;
  return NextResponse.json({ error: 'private', message: PRIVATE_ROUND_MESSAGE }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
