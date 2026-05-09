import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, checkAdminPassword, makeAdminToken } from '@/lib/adminSession';

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'server not configured (NEXTAUTH_SECRET)' }, { status: 500 });
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD env var not set on server' }, { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const password: string = body?.password || '';
  if (!password || !checkAdminPassword(password)) {
    // Small artificial delay to slow bulk guessing
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 });
  }

  const token = makeAdminToken(secret);
  const res = NextResponse.json({ ok: true });
  // Cookie is host-only on admin.goltomo.com — no cross-subdomain scope needed.
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
