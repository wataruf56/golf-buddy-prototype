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
  // LIFF の liff.getFriendship() で取得した「公式LINE友だち追加済みか」。
  // 取得できなかった環境では undefined（保存しない）。
  const friendFlag: boolean | undefined = typeof body?.friendFlag === 'boolean' ? body.friendFlag : undefined;

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

  // 赤バン（アカウント停止）ユーザーはログイン自体を拒否＝一切利用できない。
  try {
    const { isBanned } = await import('@/lib/banAccess');
    if (await isBanned(userId)) {
      return NextResponse.json(
        { error: 'banned', message: 'このアカウントはご利用いただけません。運営にお問い合わせください。' },
        { status: 403 },
      );
    }
  } catch { /* 判定不能時はログインを妨げない */ }

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
        color: '#2A8C82',
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
    } else {
      // 既存ユーザーの補完（初期値のときだけ。ユーザーが自分で設定した値は上書きしない）。
      const patch: Record<string, unknown> = {};
      // アイコン未カスタム（写真URL無し＆avatarMode未設定＝初期の絵文字のまま）なら
      // LINEのトップ画を初期アイコンに入れる。写真アップ/絵文字選択/診断アイコンは avatarMode が入るので対象外。
      if (picture && !existing.avatarUrl && !(existing as any).avatarMode) {
        patch.avatarUrl = picture;
      }
      // 名前が初期値（未設定 or 自動生成の「ゴルファー」）のままなら、LINEの表示名で補完。
      // これで、ユーザードキュメントが初期化などで作り直されて「ゴルファー」になった人も、
      // 次回ログインで本来の名前に戻る（自分で変えた名前は上書きしない）。
      const dn = (existing.displayName || '').trim();
      if (displayName && displayName !== 'ゴルファー' && (!dn || dn === 'ゴルファー')) {
        patch.displayName = displayName;
      }
      if (Object.keys(patch).length) {
        try {
          await db.upsertUser({ id: userId, ...patch } as any);
        } catch (e) {
          console.error('[liff auth] profile backfill failed', e);
        }
      }
    }
  } catch (e) {
    console.error('[liff auth] upsert failed', e);
  }

  // 公式LINE友だち状態を保存（取得できた場合のみ）。新規・既存どちらも更新する。
  if (friendFlag !== undefined) {
    try {
      await db.upsertUser({ id: userId, botFollowed: friendFlag, botFollowedAt: Date.now() } as any);
    } catch (e) {
      console.error('[liff auth] botFollowed update failed', e);
    }
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
