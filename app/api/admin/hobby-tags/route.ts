import { NextRequest, NextResponse } from 'next/server';
import { listHobbyTags, deleteHobbyTag } from '@/lib/hobbyTags';

// 管理画面：趣味タグの管理。一覧取得と、不適切タグの削除（付与済みユーザーからも除去）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const tags = await listHobbyTags(1000);
  return NextResponse.json({ tags }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const name = String(body.name || '');
  if (String(body.action || '') !== 'delete' || !name) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  const res = await deleteHobbyTag(name);
  return NextResponse.json({ ok: true, ...res }, { headers: noStore });
}
