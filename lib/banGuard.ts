import 'server-only';
import { NextResponse } from 'next/server';
import { isBanned, getRestriction, type UserRestriction } from './banAccess';

// 部分制限（通報対応）で特定機能がOFFなら403を返す。書き込みルートの先頭で使う。
export async function blockedByRestriction(
  meId: string | null | undefined,
  flag: keyof UserRestriction,
  message: string,
): Promise<NextResponse | null> {
  try {
    const r = await getRestriction(meId);
    if ((r as any)[flag]) {
      return NextResponse.json(
        { error: 'restricted', message },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch { /* 判定不能時は許可 */ }
  return null;
}

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
