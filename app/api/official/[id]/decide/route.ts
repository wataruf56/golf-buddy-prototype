import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import { officialOf, type OfficialInfo } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 集まってから決める3つ（ゴルフ場・日時・参加費）。
//
//   GET  … いまの入力状況
//   POST … 入力する（参加している人なら**誰でも**）
//   PUT  … 確定する（参加している人なら誰でも）
//
// 主催者を置かない企画なので、「決める権利」も特定の1人に寄せない。
// そのかわり確定の前に確認を1枚はさむ（クライアント側）。
//
// 集合場所と車のことはここでは扱わない。チャットで決めてもらう。
// アプリで型にはめると、かえって面倒になる部分だと判断した。

const slim = (u: any) => u ? ({
  id: u.id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl,
  avatarMode: u.avatarMode, color: u.color,
}) : null;

async function load(id: string) {
  const round = await db.getRound(id);
  if (!round) return { err: NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore }) };
  const o = officialOf(round);
  if (!o) return { err: NextResponse.json({ error: 'not_official' }, { status: 400, headers: noStore }) };
  return { round, o };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { round, o, err } = await load(params.id) as any;
  if (err) return err;
  if (!(round.applicantIds || []).includes(meId)) {
    return NextResponse.json({ error: 'forbidden', message: '参加している人だけが見られます' }, { status: 403, headers: noStore });
  }
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(round.applicantIds || [])).forEach((u: any) => { if (u) users[u.id] = slim(u); });
  } catch { /* noop */ }
  // 車代の分け方は「決めること」の画面で見せる。金額を入れる、まさにその場で要る。
  let showFareCard = true;
  try {
    const { getSettings } = await import('@/lib/officialSettings');
    showFareCard = (await getSettings()).showFareCard;
  } catch { /* 既定で出す */ }

  return NextResponse.json({
    id: round.id, title: round.title, stage: o.stage, pattern: o.pattern, showFareCard,
    decide: o.decide || {}, members: (round.applicantIds || []).map((id: string) => users[id]).filter(Boolean),
  }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { round, o, err } = await load(params.id) as any;
  if (err) return err;
  if (!(round.applicantIds || []).includes(meId)) {
    return NextResponse.json({ error: 'forbidden', message: '参加している人だけが入力できます' }, { status: 403, headers: noStore });
  }
  if (o.stage === 'confirmed') {
    return NextResponse.json({ ok: false, message: 'すでに確定しています' }, { status: 409, headers: noStore });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const now = Date.now();
  const d = { ...(o.decide || {}) };

  if (typeof body.course === 'string') {
    d.course = body.course.trim().slice(0, 60); d.courseBy = meId; d.courseAt = now;
  }
  if (typeof body.date === 'string') {
    if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ ok: false, message: '日付の形式が正しくありません' }, { status: 400, headers: noStore });
    }
    d.date = body.date; d.dateBy = meId; d.dateAt = now;
  }
  if (typeof body.startTime === 'string') {
    d.startTime = body.startTime.slice(0, 5); d.dateBy = meId; d.dateAt = now;
  }
  if (body.price !== undefined) {
    const n = Math.max(0, Math.min(999999, Math.floor(Number(body.price) || 0)));
    d.price = n ? String(n) : ''; d.priceBy = meId; d.priceAt = now;
  }

  const next: OfficialInfo = { ...o, decide: d };
  await db.updateRound(round.id, { official: next } as any);
  return NextResponse.json({ ok: true, decide: d }, { headers: noStore });
}

export async function PUT(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { round, o, err } = await load(params.id) as any;
  if (err) return err;
  if (!(round.applicantIds || []).includes(meId)) {
    return NextResponse.json({ error: 'forbidden', message: '参加している人だけが確定できます' }, { status: 403, headers: noStore });
  }
  if (o.stage === 'confirmed') return NextResponse.json({ ok: true, already: true }, { headers: noStore });

  const d = o.decide || {};
  const missing = [
    !d.course ? 'ゴルフ場' : '',
    !d.date ? '日時' : '',
    !d.price ? '参加費' : '',
  ].filter(Boolean);
  if (missing.length) {
    return NextResponse.json({ ok: false, message: `${missing.join('・')}がまだ決まっていません` }, { status: 400, headers: noStore });
  }

  const me = await db.getUser(meId);
  const next: OfficialInfo = { ...o, stage: 'confirmed', confirmedAt: Date.now(), confirmedBy: meId };

  // 確定＝部屋を作り直すのではなく、空だった項目が埋まるだけ。
  // だからチャットも参加者もそのまま続く。
  await db.updateRound(round.id, {
    official: next,
    type: 'confirmed',
    dateType: 'fixed',
    date: d.date,
    dateRange: '', // updateRound は undefined を捨てるので、消したいときは空文字
    startTime: d.startTime || undefined,
    courseName: d.course,
    price: d.price ? `${Number(d.price).toLocaleString()}円` : undefined,
    status: 'closed',
  } as any);

  try {
    await db.addRoundMessage(round.id, ADMIN_MANAGER_ID,
      `✅ ${me?.displayName || '参加者'}さんが確定しました\n`
      + `⛳ ${d.course}\n📅 ${String(d.date).replace(/-/g, '/')}${d.startTime ? ` ${d.startTime}` : ''}\n`
      + `💰 ${Number(d.price).toLocaleString()}円\n\n当日までここで連絡を取り合ってください。`);

    const users: Record<string, any> = {};
    (await db.listUsers(round.applicantIds || [])).forEach((u: any) => { if (u) users[u.id] = u; });
    const { addNotification } = await import('@/lib/notifications');
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    const { pushTo, liffUrl } = await import('@/lib/linePush');
    const link = `/round/${round.id}`;
    const text = `✅ 「${round.title}」が確定しました（${String(d.date).replace(/-/g, '/')} ${d.course}）`;
    await Promise.all((round.applicantIds || []).map(async (uid: string) => {
      await addNotification(uid, 'applyApproved', text, link);
      if (isNotifyEnabled(users[uid], 'applyApproved')) {
        pushTo(uid, text, liffUrl(link), 'official_confirmed').catch(() => {});
      }
    }));
  } catch (e) {
    console.error('[official confirm] notice failed (non-fatal)', e);
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
