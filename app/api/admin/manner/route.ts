import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：運営が事実確認のうえ、対象ユーザーのマナー/信頼度を下げる（＝mannerPenaltyを加算）。
//
// 経路は2つ：
//   ①アプリ内の通報から（/admin/reports の「評価を下げる」。従来どおり {userId, delta}）
//   ②LINE等で直接ドタキャンの報告を受けたとき（/admin/manner。{userId, reason, note, roundId}）
// どちらも `_mannerLog` に履歴を残す。誰を・いつ・なぜ下げたのかが後から追え、
// 1件ずつ取り消せる（action:'undo'）。★（また回りたい率）はユーザー同士の相互評価から
// 算出する指標なので運営は触らない。ここで動かすのはマナー/信頼度の指標だけ。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

const REASONS = ['noshow', 'late', 'no_contact', 'inappropriate', 'report', 'other'] as const;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const s = (v: any, n = 200) => (v == null ? '' : String(v).slice(0, n));

// GET: ユーザー一覧（検索用）＋ 現在ペナルティがある人 ＋ 直近の操作履歴。
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  try {
    const [usnap, lsnap] = await Promise.all([
      adb.collection('users').limit(1000).get(),
      adb.collection('_mannerLog').orderBy('createdAt', 'desc').limit(200).get().catch(() => ({ docs: [] })),
    ]);

    const users = usnap.docs
      .map((d: any) => {
        const u = d.data() || {};
        return {
          id: u.id || d.id,
          displayName: u.displayName || '（名前なし）',
          avatarUrl: u.avatarUrl || '',
          area: u.area || '',
          age: u.age || null,
          isTest: !!u.isTestAccount,
          mannerPenalty: Number(u.mannerPenalty || 0),
        };
      })
      .sort((a: any, b: any) => (b.mannerPenalty - a.mannerPenalty) || String(a.displayName).localeCompare(String(b.displayName), 'ja'));

    const nameOf: Record<string, string> = {};
    users.forEach((u: any) => { nameOf[u.id] = u.displayName; });

    const logs = lsnap.docs.map((d: any) => {
      const x = d.data() || {};
      return {
        id: d.id,
        userId: x.userId || '',
        userName: nameOf[x.userId] || x.userName || x.userId || '',
        delta: Number(x.delta || 0),
        reason: x.reason || 'other',
        note: x.note || '',
        roundId: x.roundId || '',
        roundTitle: x.roundTitle || '',
        undone: !!x.undone,
        createdAt: Number(x.createdAt || 0),
      };
    });

    return NextResponse.json({ users, flagged: users.filter((u: any) => u.mannerPenalty > 0), logs }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}

  // --- 履歴1件の取り消し（下げた分を戻す） ---
  if (body.action === 'undo') {
    const logId = s(body.logId, 120);
    if (!logId) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
    try {
      const ref = adb.collection('_mannerLog').doc(logId);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
      const log = snap.data() || {};
      if (log.undone) return NextResponse.json({ error: 'already_undone' }, { status: 409, headers: noStore });

      const user = await db.getUser(String(log.userId || ''));
      if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
      const current = Number((user as any).mannerPenalty || 0);
      const next = Math.max(0, current - Number(log.delta || 0));
      await db.upsertUser({ id: user.id, mannerPenalty: next } as any);
      await ref.update({ undone: true, undoneAt: Date.now() });
      return NextResponse.json({ ok: true, mannerPenalty: next }, { headers: noStore });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
    }
  }

  const userId = s(body.userId, 120);
  // delta 未指定は「下げる」(+1)。通報画面からは従来どおり delta:±1 が来る。
  const delta = body.delta == null ? 1 : Number(body.delta);
  if (!userId || (delta !== 1 && delta !== -1)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }
  const reason = (REASONS as readonly string[]).includes(s(body.reason, 40)) ? s(body.reason, 40) : (body.reason ? 'other' : 'report');
  const note = s(body.note, 500);
  const roundId = s(body.roundId, 120);

  const user = await db.getUser(userId);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const current = Number((user as any).mannerPenalty || 0);
  const next = Math.max(0, current + delta);
  try {
    await db.upsertUser({ id: userId, mannerPenalty: next } as any);
    // 履歴は best-effort（書けなくてもペナルティ操作自体は成立させる）
    try {
      let roundTitle = '';
      if (roundId) { const r = await db.getRound(roundId).catch(() => null); roundTitle = (r as any)?.title || ''; }
      await adb.collection('_mannerLog').add({
        userId, userName: (user as any).displayName || '',
        delta, reason, note, roundId, roundTitle,
        penaltyAfter: next, undone: false, createdAt: Date.now(),
      });
    } catch {}
    return NextResponse.json({ ok: true, mannerPenalty: next }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
