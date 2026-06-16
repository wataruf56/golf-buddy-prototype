import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAdminPassword } from '@/lib/adminSession';
import { LIFF_COOKIE_NAME, LIFF_COOKIE_MAX_AGE, makeSessionToken } from '@/lib/liffSession';

// オーナー専用のテストログイン。LINEログイン無しで「テスト用アカウント」に入り、
// PCから複数アカウントの動作検証ができる。
//
// 安全策:
//  - 管理パスワード(ADMIN_PASSWORD)を知っている人だけが使える。
//  - なりすませるのは userId が "test_" で始まるテスト専用IDのみ。実ユーザーには
//    一切なりすませない（万一パスワードが漏れても被害をテスト垢に限定）。
// 成功すると LIFF と同じ __session Cookie を発行するので、以降は普通にログイン
// 済みとして全機能を操作できる。

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'server not configured (NEXTAUTH_SECRET)' }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  if (!checkAdminPassword(String(body?.password || ''))) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  const userId = String(body?.userId || '').trim();
  if (!userId.startsWith('test_')) {
    return NextResponse.json({ error: 'テスト用IDは "test_" で始める必要があります' }, { status: 400 });
  }

  const gender = body?.gender === 'male' || body?.gender === 'female' ? body.gender : undefined;
  const car = body?.car === 'have' || body?.car === 'none' ? body.car : undefined;
  const displayName = String(body?.displayName || 'テストユーザー').slice(0, 40);

  try {
    const existing = await db.getUser(userId);
    if (!existing) {
      await db.upsertUser({
        id: userId,
        displayName,
        avatar: String(body?.avatar || '⛳'),
        color: '#2A8C82',
        age: typeof body?.age === 'number' && body.age > 0 ? body.age : 30, // 30 → 20〜30代コホート
        area: String(body?.area || '東京都'),
        scoreRange: String(body?.scoreRange || '100〜110'),
        playStyle: 'エンジョイ派',
        frequency: '月1回',
        gender: gender as any,
        car: car as any,
        reviewAvg: 0, reviewCount: 0, roundCount: 0, buddyCount: 0,
        lineId: userId,
      });
    } else {
      // 既存テスト垢は指定された属性だけ更新（性別・車・名前の切替に対応）
      const patch: any = { displayName };
      if (gender) patch.gender = gender;
      if (car) patch.car = car;
      await db.updateUser(userId, patch);
    }
  } catch (e) {
    console.error('[test-login] upsert failed', e);
  }

  const token = makeSessionToken(userId, secret);
  const res = NextResponse.json({ ok: true, userId, displayName });
  res.cookies.set(LIFF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: LIFF_COOKIE_MAX_AGE,
  });
  return res;
}
