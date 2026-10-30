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
  const allowed = ['displayName', 'age', 'gender', 'car', 'bio', 'area', 'scoreRange', 'playStyle', 'frequency', 'golmotiType', 'avatar', 'avatarUrl', 'avatarMode', 'recentScores', 'notifyOff', 'notifyPrefs', 'golfHistory', 'realNameLast', 'realNameFirst', 'instagram', 'availableDays', 'drinkStatus', 'smokeStatus', 'job', 'nearestStation'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) patch[key] = body[key];

  // 希望条件でのラウンド通知（県・曜日・送迎）。サニタイズして保存。
  if ('notifyMatch' in body) {
    const nm = (body.notifyMatch || {}) as any;
    const { allPrefectures } = await import('@/lib/mockData');
    const areaSet = new Set(allPrefectures);
    const areas = Array.isArray(nm.areas)
      ? Array.from(new Set(nm.areas.map((a: any) => String(a)).filter((a: string) => areaSet.has(a)))).slice(0, 47)
      : [];
    const daySet = new Set(['平日', '土日']);
    const days = Array.isArray(nm.days)
      ? Array.from(new Set(nm.days.map((d: any) => String(d)).filter((d: string) => daySet.has(d))))
      : [];
    // 送迎の希望（3択）。旧データ/旧クライアントの pickup:true は 'pickup' に読み替え。
    let pickupPref: 'any' | 'pickup' | 'car' = 'any';
    if (nm.pickupPref === 'pickup' || nm.pickupPref === 'car' || nm.pickupPref === 'any') pickupPref = nm.pickupPref;
    else if (nm.pickup === true) pickupPref = 'pickup';
    // 県を1つ以上選んでいないと通知しようがないので、その場合は enabled=false に落とす。
    patch.notifyMatch = { enabled: !!nm.enabled && areas.length > 0, areas, days, pickupPref };
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

  const before = await db.getUser(meId);
  // 誕生日（2026-10-20 本人指定）。入力は年齢ではなく誕生日。年齢は誕生日から出す（lib/ageGate.liveAge）。
  //   ・一度登録したら本人は変えられない（同じ値はそのまま通す）。変更は管理画面から（POST /api/admin/user-age）。
  //   ・前から年齢で登録している人が誕生日を入れるとき、40歳以上で登録していた人が40歳未満になる誕生日は受け付けない（年代をまたぐので運営へ）。
  if ('birthday' in body) {
    const { isValidBirthday, ageFromBirthday } = await import('@/lib/ageGate');
    const b = String(body.birthday || '');
    const cur = String((before as any)?.birthday || '');
    if (cur) {
      if (b && b !== cur) return NextResponse.json({ error: 'birthday_locked', message: '誕生日は一度登録すると変えられません。変更が必要なときは「ゴル友」タブの「管理者にDM」からご連絡ください' }, { status: 400 });
    } else if (b) {
      if (!isValidBirthday(b)) return NextResponse.json({ error: 'bad_birthday', message: '誕生日を正しく入れてください' }, { status: 400 });
      const nextAge = ageFromBirthday(b);
      const oldAge = Number(before?.age) || 0;
      if (oldAge >= 40 && nextAge < 40) {
        return NextResponse.json({ error: 'birthday_mismatch', message: `登録されている年齢（${oldAge}歳）と誕生日が合いません。お手数ですが「ゴル友」タブの「管理者にDM」からご連絡ください` }, { status: 400 });
      }
      patch.birthday = b;
      patch.age = nextAge;
    }
  }
  if ((before as any)?.birthday || patch.birthday) {
    // 誕生日がある人の年齢は誕生日から決まる（送られてきた年齢は使わない）
    if (!patch.birthday) delete patch.age;
  } else if ('age' in patch) {
    // 誕生日がまだ無い人（前からの会員・古い画面）：年齢は一度登録したら本人は変えられない（2026-10-20）。
    // 同じ値をそのまま送ってくるのは通す（プロフィール編集の保存で毎回送られるため）。
    const cur = Number(before?.age) || 0;
    const next = Number(patch.age) || 0;
    if (cur > 0 && next !== cur) {
      return NextResponse.json({ error: 'age_locked', message: '年齢は一度登録すると変えられません。変更が必要なときは「ゴル友」タブの「管理者にDM」からご連絡ください' }, { status: 400 });
    }
    if (cur > 0) delete patch.age;
  }
  // プロフィール登録の時刻（年齢が初めて入ったとき）（2026-10-12）。営業系ポップアップを24時間あとに出すため（lib/popupEligibility）。
  // すでに登録済みだった古い会員には入れない（いま入れると、24時間ぶん出なくなってしまう＝createdAt で代用する）。
  {
    const { isProfileRegistered } = await import('@/lib/popupEligibility');
    if ('age' in patch && !isProfileRegistered(before) && Number(patch.age) > 0 && !before?.profileCompletedAt) {
      patch.profileCompletedAt = Date.now();
    }
  }
  await db.updateUser(meId, patch as any);
  if (hobbyDelta && (hobbyDelta.added.length || hobbyDelta.removed.length)) {
    try { const { applyHobbyDelta } = await import('@/lib/hobbyTags'); await applyHobbyDelta(hobbyDelta.added, hobbyDelta.removed); } catch {}
  }
  const me = await db.getUser(meId);
  // 2026-10-08：プロフィールが足りないまま「行ける日」を押していた人は、そろった時点で同じ日の部屋に入れる
  try {
    // 部屋に入る条件は年齢・性別（最寄り駅は無くても入れる・2026-10-31）
    const { roomMissingFor } = await import('@/lib/availabilityShared');
    if (me && before && roomMissingFor(before).length > 0 && roomMissingFor(me).length === 0) {
      const { getAvailability, todayJst } = await import('@/lib/availability');
      const av = await getAvailability(meId);
      const lo = todayJst();
      const dates = (av?.dates || []).filter((d) => d >= lo);
      if (dates.length) {
        const { onAvailabilityAdded } = await import('@/lib/availRooms');
        for (const d of dates) await onAvailabilityAdded(me, d);
      }
    }
  } catch (e) { console.warn('[me] avail rooms after profile failed', (e as Error).message); }
  return NextResponse.json({ me });
}
