import 'server-only';
import { NextResponse } from 'next/server';
import { isBanned } from './banAccess';

// Returns a 403 response if the user is 赤バン (banned), else null.
// Use at the top of community/matching write routes:
//   const ban = await blockedIfBanned(meId); if (ban) return ban;
export async function blockedIfBanned(meId: string | null | undefined): Promise<NextResponse | null> {
  if (await isBanned(meId)) {
    return NextResponse.json(
      { error: 'banned', message: 'この機能の利用が制限されています。運営にお問い合わせください。' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}
