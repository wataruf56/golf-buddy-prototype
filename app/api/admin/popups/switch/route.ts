import { NextRequest, NextResponse } from 'next/server';
import { getPopupOffMap, setPopupOff } from '@/lib/popupSwitch';
import { popupDef } from '@/lib/popupCatalog';

// GET  /api/admin/popups/switch?token=XXX            … 止めているポップアップ { off: { id: { at } } }
// POST /api/admin/popups/switch?token=XXX {id, on}   … オン・オフを切り替える（2026-11-01・管理画面「🪟 ポップアップ」）
// 止められないもの（lib/popupCatalog の lock）は 400。切り替えは操作ログ（config.save）にも残す。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  return NextResponse.json({ off: await getPopupOffMap() }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || '');
  const on = body?.on !== false;
  const def = popupDef(id);
  if (!def) return NextResponse.json({ error: 'unknown_popup' }, { status: 400, headers: noStore });
  if (def.lock) return NextResponse.json({ error: 'locked', message: def.lock }, { status: 400, headers: noStore });
  try {
    const off = await setPopupOff(id, !on);
    try {
      const { audit, AUDIT_ACTION } = await import('@/lib/auditLog');
      await audit({
        action: AUDIT_ACTION.configSave, actorKind: 'token', actorId: 'token',
        targetId: `popup:${id}`, targetName: def.name, targetKind: 'config',
        summary: `ポップアップ「${def.name}」を${on ? 'オン（出す）' : 'オフ（止める）'}にした`,
      }, req);
    } catch { /* ログの失敗で切り替えは止めない */ }
    return NextResponse.json({ ok: true, off }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
