import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// プロフィールの「自分だけのメモ」（2026-10-23 本人指定）。
// ほかの会員（管理人を含む）のプロフィールに、自分用の覚え書きを残す（「この人どんな仕事だっけ」を忘れないように）。
// 見られるのは書いた本人だけ。相手には伝わらない・通知もしない。1,000文字まで。
// 保存：profileNotes/{書いた人}__{相手}（ownerId・targetId・text・updatedAt）。空で保存すると消す。
// GET /api/users/[id]/note → { text, updatedAt } ／ PUT { text } → { ok, text, updatedAt }
const MAX_NOTE = 1000;   // route.ts からは定数を export しない（next build が落ちる）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';
const docId = (owner: string, target: string) => `${owner}__${target}`;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb || !params.id || params.id === meId) return NextResponse.json({ text: '', updatedAt: 0 }, { headers: noStore });
  const s = await adb.collection('profileNotes').doc(docId(meId, params.id)).get();
  const d = s.exists ? s.data() || {} : {};
  return NextResponse.json({ text: String(d.text || ''), updatedAt: Number(d.updatedAt || 0) }, { headers: noStore });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!params.id || params.id === meId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const text = String(body.text ?? '').replace(/\r\n/g, '\n');
  if (Array.from(text).length > MAX_NOTE) return NextResponse.json({ error: 'too_long', message: `メモは${MAX_NOTE.toLocaleString()}文字までです` }, { status: 400, headers: noStore });
  const ref = adb.collection('profileNotes').doc(docId(meId, params.id));
  const now = Date.now();
  if (!text.trim()) { await ref.delete().catch(() => {}); return NextResponse.json({ ok: true, text: '', updatedAt: 0 }, { headers: noStore }); }
  await ref.set({ ownerId: meId, targetId: params.id, text, updatedAt: now }, { merge: true });
  return NextResponse.json({ ok: true, text, updatedAt: now }, { headers: noStore });
}
