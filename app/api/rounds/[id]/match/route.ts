import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { addNotification } from '@/lib/notifications';
import { getAdminDb } from '@/lib/firebase';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isSameGroup, isNoShow } from '@/lib/groups';

// ラウンド後のマッチング。2種類の「いいね」を独立に扱う:
//   again    = また一緒に回りたい（ゴル友的・同性/異性問わず）
//   romantic = 異性として気になる（恋愛的）
// どちらも「マッチ（相互いいね）」した時だけ、双方に通知する。片思いの
// 間は相手に一切知られない。
//
// 保存: Firestore `_matchLikes` / docId = `${kind}__${from}__${to}`。
// 未設定環境（デモ等）はモジュール内メモリにフォールバック（単一ユーザーのため
// マッチは成立しないが、UIのトグルは動く）。

type Kind = 'again' | 'romantic';
const KINDS: Kind[] = ['again', 'romantic'];
const noStore = { 'Cache-Control': 'no-store' };
const docId = (kind: Kind, from: string, to: string) => `${kind}__${from}__${to}`;

// メモリフォールバック（getAdminDb が無いとき）
const mem = new Set<string>();

async function likeExists(id: string): Promise<boolean> {
  const adb = getAdminDb() as any;
  if (!adb) return mem.has(id);
  try { const s = await adb.collection('_matchLikes').doc(id).get(); return s.exists; }
  catch { return false; }
}
async function setLike(id: string, data: any, on: boolean) {
  const adb = getAdminDb() as any;
  if (!adb) { if (on) mem.add(id); else mem.delete(id); return; }
  try {
    if (on) await adb.collection('_matchLikes').doc(id).set(data, { merge: true });
    else await adb.collection('_matchLikes').doc(id).delete();
  } catch { /* noop */ }
}

// GET /api/rounds/[id]/match — 自分の各相手への like 状況と相互マッチ状況
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  // 当日来れなかった人（除外）はマッチ対象から外す。
  const others = Array.from(new Set([round.hostId, ...(round.applicantIds || [])]))
    .filter((id) => id && id !== meId && !isNoShow(round, id));

  const state: Record<string, { again: boolean; romantic: boolean; matchedAgain: boolean; matchedRomantic: boolean; sameGroup: boolean }> = {};
  await Promise.all(others.map(async (to) => {
    // コンペは「同じ組」だけが通常レビュー対象。別の組は任意の「回ってみたい」(=again)のみ。
    const sameGroup = isSameGroup(round, meId, to);
    const entry = { again: false, romantic: false, matchedAgain: false, matchedRomantic: false, sameGroup };
    for (const k of KINDS) {
      const mine = await likeExists(docId(k, meId, to));
      const theirs = mine ? await likeExists(docId(k, to, meId)) : false;
      if (k === 'again') { entry.again = mine; entry.matchedAgain = mine && theirs; }
      else { entry.romantic = mine; entry.matchedRomantic = mine && theirs; }
    }
    state[to] = entry;
  }));

  // 参加者の表示用情報（名前・アバター・性別）も返す。
  const users: Record<string, any> = {};
  await Promise.all(others.map(async (id) => {
    const u = await db.getUser(id);
    users[id] = u
      ? { displayName: u.displayName || 'メンバー', avatar: u.avatar || '⛳', avatarUrl: (u as any).avatarUrl || '', gender: u.gender || '', age: u.age || 0 }
      : { displayName: 'メンバー', avatar: '⛳' };
  }));

  return NextResponse.json({ state, users, isCompetition: !!round.isCompetition }, { headers: noStore });
}

// POST /api/rounds/[id]/match — { toUserId, kind, on }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const toUserId = String(body?.toUserId || '');
  const kind = body?.kind as Kind;
  const on = body?.on !== false; // default true
  if (!toUserId || toUserId === meId || !KINDS.includes(kind)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400, headers: noStore });
  }

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });
  // 参加者（主催者＋承認済み）同士のみ
  const members = new Set([round.hostId, ...(round.applicantIds || [])]);
  if (!members.has(meId) || !members.has(toUserId)) {
    return NextResponse.json({ error: 'not a participant' }, { status: 403, headers: noStore });
  }
  // 当日来れなかった人には付けられない。
  if (on && isNoShow(round, toUserId)) {
    return NextResponse.json({ error: 'no_show', message: 'この相手は「当日来れなかった人」に設定されています' }, { status: 403, headers: noStore });
  }
  // 「異性として気になる」は同じ組の相手のみ。別の組へは任意の「回ってみたい」(=again)だけ。
  if (on && kind === 'romantic' && !isSameGroup(round, meId, toUserId)) {
    return NextResponse.json({ error: 'not_same_group', message: '「気になる」は同じ組の相手のみ選べます' }, { status: 403, headers: noStore });
  }

  await setLike(docId(kind, meId, toUserId), { from: meId, to: toUserId, kind, roundId: params.id, ts: Date.now() }, on);

  let matched = false;
  if (on) {
    matched = await likeExists(docId(kind, toUserId, meId));
    if (matched) {
      const me = await db.getUser(meId);
      const other = await db.getUser(toUserId);
      const meName = me?.displayName || '相手';
      const otherName = other?.displayName || '相手';
      // 通知タップ先は「ゴル友」タブの該当マッチ一覧（また回りたい / 気になる）。
      const link = kind === 'again' ? '/buddies?tab=again' : '/buddies?tab=romantic';
      const tplKey = kind === 'again' ? 'matchAgain' : 'matchRomantic';
      const { renderNotif } = await import('@/lib/notificationTemplateStore');
      // アプリ内通知に加えて、設定ONならLINE push＋Web pushも送る（マッチは重要イベント）。
      // partnerName＝受け手から見た「相手（好意をくれた人）」の名前。
      const notifyMatch = async (rid: string, ruser: any, partnerName: string) => {
        const n = await renderNotif(tplKey, { '相手の名前': partnerName });
        if (n.inApp) await addNotification(rid, 'match', n.inApp, link);
        if (isNotifyEnabled(ruser, 'match')) {
          pushTo(rid, n.line, liffUrl(link)).catch(() => {});
          webPushText(rid, n.webTitle, n.webBody, link, `match-${params.id}-${rid}`).catch(() => {});
        }
      };
      if (kind === 'again') {
        // 「異性として気になる」もマッチなら、そちらを優先して again の通知はしない。
        const romanticMutual = (await likeExists(docId('romantic', meId, toUserId))) && (await likeExists(docId('romantic', toUserId, meId)));
        if (!romanticMutual) {
          await notifyMatch(toUserId, other, meName);
          await notifyMatch(meId, me, otherName);
        }
      } else {
        await notifyMatch(toUserId, other, meName);
        await notifyMatch(meId, me, otherName);
      }
    }
  }

  return NextResponse.json({ ok: true, matched }, { headers: noStore });
}
