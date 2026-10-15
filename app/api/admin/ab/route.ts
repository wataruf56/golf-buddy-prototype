import { NextRequest, NextResponse } from 'next/server';
import { createAdTest, deleteAdTest, funnelsFor, listAdTests, updateAdTest } from '@/lib/adTests';

// 広告A/Bテストの管理。?token=ADMIN_LOG_TOKEN で保護。
//
//   GET  /api/admin/ab?token=...                  一覧（LP側の数字つき）
//   POST /api/admin/ab?token=...
//     {action:'create', name, startDate, endDate, landing?, note?, variants:[{label, ref, imageUrl?}]}
//     {action:'save',   id, name?, startDate?, endDate?, note?, variants?:[{key, label?, imageUrl?, impressions?, clicks?, spend?, profileVisits?}]}
//     {action:'delete', id}

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function ok(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    const tests = await listAdTests();
    const withFunnels = await Promise.all(tests.map(async (t) => {
      try { return { ...t, funnels: await funnelsFor(t) }; }
      catch (e: any) { return { ...t, funnels: {}, funnelError: String(e?.message || e) }; }
    }));
    return NextResponse.json({ tests: withFunnels }, { headers: noStore });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '');
  try {
    if (action === 'create') {
      const t = await createAdTest(body);
      return NextResponse.json({ ok: true, test: t }, { headers: noStore });
    }
    if (action === 'save') {
      if (!body?.id) return NextResponse.json({ error: 'id がありません' }, { status: 400, headers: noStore });
      await updateAdTest(String(body.id), body);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (action === 'delete') {
      if (!body?.id) return NextResponse.json({ error: 'id がありません' }, { status: 400, headers: noStore });
      await deleteAdTest(String(body.id));
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    return NextResponse.json({ error: `不明な操作: ${action}` }, { status: 400, headers: noStore });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400, headers: noStore });
  }
}
