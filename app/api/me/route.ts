import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = await db.getUser(meId);
  return NextResponse.json({ me });
}

export async function PATCH(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const allowed = ['displayName', 'age', 'gender', 'car', 'bio', 'area', 'scoreRange', 'playStyle', 'frequency', 'golmotiType', 'avatar', 'avatarUrl', 'avatarMode', 'recentScores', 'notifyOff', 'notifyPrefs', 'golfHistory', 'realNameLast', 'realNameFirst', 'instagram', 'availableDays', 'drinkStatus', 'smokeStatus', 'job'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) patch[key] = body[key];

  // 希望条件でのラウンド通知（県・曜日・送迎）。サニタイズして保存。
  if ('notifyMatch' in body) {
    const nm = (body.notifyMatch || {}) as any;
    const { allAreas } = await import('@/lib/mockData');
    const areaSet = new Set(allAreas);
    const areas = Array.isArray(nm.areas)
      ? Array.from(new Set(nm.areas.map((a: any) => String(a)).filter((a: string) => areaSet.has(a)))).slice(0, 20)
      : [];
    const daySet = new Set(['平日', '土日']);
    const days = Array.isArray(nm.days)
      ? Array.from(new Set(nm.days.map((d: any) => String(d)).filter((d: string) => daySet.has(d))))
      : [];
    // 県を1つ以上選んでいないと通知しようがないので、その場合は enabled=false に落とす。
    patch.notifyMatch = { enabled: !!nm.enabled && areas.length > 0, areas, days, pickup: !!nm.pickup };
  }

  // 趣味タグ：正規化・重複除去・最大数制限。共有台帳(_hobbyTags)の count も増減する。
  let hobbyDelta: { added: string[]; removed: string[] } | null = null;
  if ('hobbies' in body) {
    const { normalizeHobby } = await import('@/lib/lifestyle');
    const seen = new Set<string>();
    const hobbies: string[] = [];
    for (const raw of Array.isArray(body.hobbies) ? body.hobbies : []) {
      const nm = normalizeHobby(String(raw || ''));
      if (nm && !seen.has(nm)) { seen.add(nm); hobbies.push(nm); }
      if (hobbies.length >= 20) break;
    }
    patch.hobbies = hobbies;
    const before = await db.getUser(meId);
    const old = new Set((before?.hobbies || []).map((h) => normalizeHobby(h)));
    const now = new Set(hobbies);
    hobbyDelta = {
      added: hobbies.filter((h) => !old.has(h)),
      removed: Array.from(old).filter((h) => !now.has(h)),
    };
  }

  await db.updateUser(meId, patch as any);
  if (hobbyDelta && (hobbyDelta.added.length || hobbyDelta.removed.length)) {
    try { const { applyHobbyDelta } = await import('@/lib/hobbyTags'); await applyHobbyDelta(hobbyDelta.added, hobbyDelta.removed); } catch {}
  }
  const me = await db.getUser(meId);
  return NextResponse.json({ me });
}
