import { NextRequest, NextResponse } from 'next/server';
import { availPromptProgress, deleteAvailPrompt, listAvailPrompts, upsertAvailPrompt } from '@/lib/availPrompt';

// 管理者用：ラウンド参加者への「行ける日」ポップアップ＋LINE（lib/availPrompt）（2026-10-11）
//   GET    … 登録済みの一覧と、レビューの進み具合（残っている人の名前）・行ける日が未入力の人数
//   POST   … { roundId, showAt?: ms | 'YYYY-MM-DDTHH:mm'（JST）, approved?: boolean }
//            approved:true にして showAt を過ぎると、アプリを開いた人にポップアップ、cron が LINE を1回送る
//   DELETE … { roundId }
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}
function toMs(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Date.parse(`${s}:00+09:00`);
  const n = Number(s); return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const prompts = await listAvailPrompts();
  const rows = await Promise.all(prompts.map(async (p) => ({
    ...p, showAtJst: p.showAt ? new Date(p.showAt + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '',
    progress: await availPromptProgress(p.roundId).catch(() => null),
  })));
  return NextResponse.json({ prompts: rows }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const roundId = String(body.roundId || '');
  if (!roundId) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  const patch: any = {};
  const showAt = toMs(body.showAt); if (showAt !== undefined) patch.showAt = showAt;
  if (typeof body.approved === 'boolean') patch.approved = body.approved;
  const saved = await upsertAvailPrompt(roundId, patch);
  if (!saved) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, prompt: saved, progress: await availPromptProgress(roundId).catch(() => null) }, { headers: noStore });
}

export async function DELETE(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  await deleteAvailPrompt(String(body.roundId || ''));
  return NextResponse.json({ ok: true }, { headers: noStore });
}
