import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：通報の一覧取得と、対応ステータス更新（1回限りの手動運用）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  try {
    const snap = await adb.collection('_reports').limit(500).get();
    const reports = snap.docs
      .map((d: any) => {
        const r = d.data() || {};
        // 旧スキーマ（reportedId / ts / reason=自由文）を正規化。
        return {
          id: d.id,
          reporterId: r.reporterId || '',
          reporterName: r.reporterName || '',
          targetId: r.targetId || r.reportedId || '',
          targetName: r.targetName || '',
          reason: r.reason || 'other',
          detail: r.detail || (r.reason && !['inappropriate', 'noshow', 'no_contact', 'other'].includes(r.reason) ? r.reason : ''),
          roundId: r.roundId || null,
          status: r.status || 'open',
          createdAt: r.createdAt || r.ts || 0,
        };
      })
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ reports }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// POST { action: 'resolve'|'reopen', id }
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const id = String(body.id || '');
  const action = String(body.action || '');
  if (!id || !['resolve', 'reopen'].includes(action)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  try {
    await adb.collection('_reports').doc(id).set({ status: action === 'resolve' ? 'resolved' : 'open', updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
