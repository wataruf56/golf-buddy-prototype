import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';
import { sendRoundInvite, buildInviteContext, inviteeBlock, roundInviteBlock, roundWhenLabel, type InviteContext } from '@/lib/roundInvite';
import type { User } from '@/lib/types';

// 管理画面「代わりに招待する」（2026-10-13）。
// 運営が、自分の募集ではない募集中のラウンドに、主催者の代わりに会員を招待する。
// 招待そのもの（保存・通知・受け取った人の画面・「参加する」で即参加）は主催者の招待と同じ（lib/roundInvite）。
// 違い：通知の文面が「ゴルトモ運営から…」、round.invitedBy[userId]='admin' が残る、操作ログ（監査ログ）に残る、
// 主催者のアプリ内お知らせに「運営が〇〇さんを招待しました」が届く（LINEは送らない）。
//
// GET  /api/admin/round-invite?token=XXX&roundId=YYY[&q=名前]  候補（気になる／見に来た人／検索）
// POST /api/admin/round-invite?token=XXX  body: { roundId, userIds: string[], message?: string }

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const MAX_PER_SEND = 20;
const MAX_VIEWERS = 150;
const MAX_SEARCH = 40;

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

type Cand = {
  id: string;
  displayName: string;
  gender: string;
  age: number | null;
  area: string;
  avatar: string;
  hasPhoto: boolean;
  lastActiveAt: number | null;
  /** 招待できない理由（検索結果だけ。候補グループには招待できる人しか入れない） */
  ng?: string;
  invited?: { by: 'host' | 'admin' | 'unknown'; at: number | null };
  viewedAt?: number;
  viewCount?: number;
};

function toCand(u: User, ctx: InviteContext): Cand {
  const r = ctx.round;
  const invited = (r.invitedIds || []).includes(u.id)
    ? { by: ((r.invitedBy || {})[u.id] || 'unknown') as 'host' | 'admin' | 'unknown', at: (r.invitedAt || {})[u.id] || null }
    : undefined;
  return {
    id: u.id,
    displayName: u.displayName || '(名前未設定)',
    gender: u.gender || '',
    age: u.age || null,
    area: u.area || '',
    avatar: u.avatar || '⛳',
    hasPhoto: !!u.avatarUrl,
    lastActiveAt: u.lastActiveAt || null,
    ...(invited ? { invited } : {}),
  };
}

const norm = (s: string) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const url = new URL(req.url);
  const roundId = url.searchParams.get('roundId') || '';
  const q = (url.searchParams.get('q') || '').trim();
  if (!roundId) return NextResponse.json({ error: 'roundId required' }, { status: 400, headers: noStore });

  try {
    const round = await db.getRound(roundId);
    if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const ctx = await buildInviteContext(round);

    // 検索だけのとき（入力のたびに呼ぶ）は候補グループを組み立てない
    if (q) {
      const results = await searchUsers(q, ctx);
      return NextResponse.json({ results }, { headers: noStore });
    }

    const excluded: Record<string, number> = {};
    const pick = (users: User[]): Cand[] => {
      const out: Cand[] = [];
      for (const u of users) {
        const b = inviteeBlock(u, ctx);
        if (b) { if (b.kind === 'ng') excluded[b.reason] = (excluded[b.reason] || 0) + 1; continue; }
        out.push(toCand(u, ctx));
      }
      return out;
    };

    // ❤️ この募集を「気になる」した人
    const interestedIds = Array.from(new Set(round.interestedIds || []));
    const interestedUsers = interestedIds.length ? await db.listUsers(interestedIds) : [];
    const interested = pick(interestedUsers);

    // 👀 見に来た人（最終閲覧の新しい順）。気になるに出した人は重ねない
    const shown = new Set(interestedIds);
    const viewEntries = Object.entries(round.viewedBy || {})
      .filter(([id]) => id && !shown.has(id))
      .map(([id, v]) => ({ id, at: v?.at || 0, count: v?.count || 0 }))
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_VIEWERS);
    const viewerUsers = viewEntries.length ? await db.listUsers(viewEntries.map((e) => e.id)) : [];
    const vById = new Map(viewerUsers.map((u) => [u.id, u]));
    const viewers = pick(viewEntries.map((e) => vById.get(e.id)).filter(Boolean) as User[]).map((c) => {
      const e = viewEntries.find((x) => x.id === c.id);
      return { ...c, viewedAt: e?.at, viewCount: e?.count };
    });

    // 💌 招待済み（まだ参加していない人）。誰が・いつ招待したか
    const pendingInvites = (round.invitedIds || []).filter((id) => !(round.applicantIds || []).includes(id) && !(round.pendingApplicantIds || []).includes(id));
    const invitedUsers = pendingInvites.length ? await db.listUsers(pendingInvites) : [];
    const invited = invitedUsers.map((u) => toCand(u, ctx)).sort((a, b) => (b.invited?.at || 0) - (a.invited?.at || 0));
    // 運営の招待から参加した人の数（分析用の目安）
    const joinedViaAdmin = (round.applicantIds || []).filter((id) => (round.invitedBy || {})[id] === 'admin').length;

    // 受け取る人に届く文面の見本（一言なし）
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const host = ctx.host;
    const n = await renderNotif('invitedByAdmin', { '募集タイトル': round.title, '日時': roundWhenLabel(round), '主催者名': host?.displayName || '募集者', 'ひとこと': '' });

    const { genderSlotStatus } = await import('@/lib/genderSlots');
    const { membersAsUsers } = await import('@/lib/genderSlotsServer');
    const slots = genderSlotStatus(round, await membersAsUsers(round));

    return NextResponse.json({
      round: {
        id: round.id, title: round.title, status: round.status, when: roundWhenLabel(round),
        place: round.courseName || round.venue || round.area || '',
        hostId: round.hostId, hostName: host?.displayName || '(不明)',
        currentCount: round.currentCount || 0, maxSpots: round.maxSpots || 0,
        hostCohort: round.hostCohort || null, genderCondition: round.genderCondition || 'any', beginnerOnly: !!round.beginnerOnly,
        isTest: ctx.isTestRound,
        slots: slots.has ? { male: slots.male.left, female: slots.female.left } : null,
        joinedViaAdmin,
      },
      blocked: roundInviteBlock(round),
      interested, viewers, invited, excluded,
      preview: { inApp: n.inApp, line: n.line },
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

/** 全会員から名前（またはID）で探す。主催者・参加済み・BAN・テスト垢は出さない。条件が合わない人は理由つきで出す。 */
async function searchUsers(q: string, ctx: InviteContext): Promise<Cand[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  const nq = norm(q);
  const snap = await adb.collection('users')
    .select('displayName', 'gender', 'age', 'area', 'avatar', 'avatarUrl', 'lastActiveAt', 'scoreRange')
    .limit(5000).get();
  const hits: User[] = [];
  for (const d of snap.docs) {
    const u = { ...(d.data() || {}), id: d.id } as User;
    if (d.id === q || norm(u.displayName || '').includes(nq)) hits.push(u);
  }
  const out: Cand[] = [];
  for (const u of hits) {
    const b = inviteeBlock(u, ctx);
    if (b?.kind === 'hide') continue;
    const c = toCand(u, ctx);
    if (b?.kind === 'ng') c.ng = b.reason;
    out.push(c);
  }
  // 招待できる人 → 最近ログインした人 を上に
  out.sort((a, b) => (Number(!!a.ng || !!a.invited) - Number(!!b.ng || !!b.invited)) || ((b.lastActiveAt || 0) - (a.lastActiveAt || 0)));
  return out.slice(0, MAX_SEARCH);
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const roundId = String(body?.roundId || '').trim();
  const message = String(body?.message || '').trim().slice(0, 200);
  const userIds: string[] = Array.from(new Set<string>((Array.isArray(body?.userIds) ? body.userIds : []).map((x: any) => String(x || '').trim()).filter(Boolean)));
  if (!roundId) return NextResponse.json({ error: 'roundId required' }, { status: 400, headers: noStore });
  if (!userIds.length) return NextResponse.json({ error: 'userIds required' }, { status: 400, headers: noStore });
  if (userIds.length > MAX_PER_SEND) {
    return NextResponse.json({ error: 'too_many', message: `一度に招待できるのは${MAX_PER_SEND}人までです` }, { status: 400, headers: noStore });
  }

  try {
    const round = await db.getRound(roundId);
    if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const rb = roundInviteBlock(round);
    if (rb) return NextResponse.json({ error: 'round_blocked', message: rb }, { status: 400, headers: noStore });

    // 送る直前にもう一度、参加申請と同じ条件で確かめる（画面を開いてから状態が変わっていることがある）
    const ctx = await buildInviteContext(round);
    const actor = await adminActor(null);
    const sent: Array<{ id: string; name: string }> = [];
    const skipped: Array<{ id: string; name: string; reason: string }> = [];

    for (const uid of userIds) {
      const u = await db.getUser(uid).catch(() => null);
      const name = u?.displayName || uid;
      const b = inviteeBlock(u, ctx);
      if (b) { skipped.push({ id: uid, name, reason: b.reason }); continue; }
      const { round: after, added } = await sendRoundInvite({ round: ctx.round, inviteeId: uid, by: 'admin', message });
      ctx.round = after;   // 次の人の判定で「招待済み」を正しく見る
      if (!added) { skipped.push({ id: uid, name, reason: '招待済み' }); continue; }
      sent.push({ id: uid, name });
      await audit({
        ...actor,
        action: AUDIT_ACTION.roundAdminInvite,
        targetKind: 'user', targetId: uid, targetName: name,
        summary: `「${round.title}」（${roundWhenLabel(round)}・主催 ${ctx.host?.displayName || round.hostId}）に「${name}」さんを運営として招待した`,
        detail: { roundId: round.id, roundTitle: round.title, hostId: round.hostId, ...(message ? { message } : {}) },
      }, req);
    }

    // 主催者にはアプリ内お知らせだけ（LINEは送らない）。参加したら accept-invite がいつも通り「招待を承認して参加しました」を送る。
    if (sent.length) {
      try {
        const names = sent.slice(0, 5).map((s) => `${s.name}さん`).join('、') + (sent.length > 5 ? ` ほか${sent.length - 5}人` : '');
        const { addNotification } = await import('@/lib/notifications');
        await addNotification(round.hostId, 'applyReceived', `📣 ゴルトモ運営が「${round.title}」に ${names} を招待しました（参加するとお知らせします）`, `/round/${round.id}`);
      } catch { /* お知らせの失敗で招待は止めない */ }
    }

    return NextResponse.json({ ok: true, sent, skipped }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
