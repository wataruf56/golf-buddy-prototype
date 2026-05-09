import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { LIFF_COOKIE_NAME, LIFF_COOKIE_MAX_AGE, makeSessionToken } from '@/lib/liffSession';

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || '';
  const liffChannelId = process.env.LIFF_CHANNEL_ID || process.env.LINE_CLIENT_ID || '';
  if (!secret || !liffChannelId) {
    return NextResponse.json({ error: 'server not configured (NEXTAUTH_SECRET / LIFF_CHANNEL_ID)' }, { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const idToken: string = body?.idToken || '';
  if (!idToken) return NextResponse.json({ error: 'idToken required' }, { status: 400 });

  // Verify with LINE
  const params = new URLSearchParams();
  params.set('id_token', idToken);
  params.set('client_id', liffChannelId);
  let verified: any;
  try {
    const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    verified = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: 'verify failed', detail: verified }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json({ error: 'verify error', message: (e as Error).message }, { status: 502 });
  }

  const userId: string = verified?.sub || '';
  if (!userId) return NextResponse.json({ error: 'no sub in verified token' }, { status: 401 });

  const displayName: string = verified?.name || 'ゴルファー';
  const picture: string | undefined = verified?.picture;

  // Upsert user (create only if missing — preserve existing profile)
  let isNewUser = false;
  try {
    const existing = await db.getUser(userId);
    if (!existing) {
      await db.upsertUser({
        id: userId,
        displayName,
        avatar: '⛳',
        avatarUrl: picture,
        color: '#2D8C4E',
        age: 0,
        area: '',
        scoreRange: '',
        playStyle: '',
        frequency: '',
        reviewAvg: 0,
        reviewCount: 0,
        roundCount: 0,
        buddyCount: 0,
        lineId: userId,
      });
      isNewUser = true;
    }
  } catch (e) {
    console.error('[liff auth] upsert failed', e);
  }

  // Notify admins on new signup (LINE push). Best-effort, never block login.
  if (isNewUser) {
    const adminIds = (process.env.ADMIN_NOTIFY_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (adminIds.length) {
      try {
        const { pushToMany, liffUrl } = await import('@/lib/linePush');
        const pretty = displayName || '(名前なし)';
        pushToMany(
          adminIds,
          `🆕 新規ユーザー登録\n${pretty}\nuserId: ${userId.slice(0, 12)}...`,
          liffUrl(`/admin/users`),
        ).catch(() => {});
      } catch { /* noop */ }
    }
  }

  const token = makeSessionToken(userId, secret);
  const res = NextResponse.json({ ok: true, userId });
  // Host-only cookie — matches pre-domain-migration behaviour. Admin uses its
  // own gb_admin_session cookie now (lib/adminSession.ts), so we no longer
  // need to scope this to the parent .goltomo.com domain.
  res.cookies.set(LIFF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none', // LIFF runs in LINE's in-app webview — needs SameSite=None
    path: '/',
    maxAge: LIFF_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LIFF_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
