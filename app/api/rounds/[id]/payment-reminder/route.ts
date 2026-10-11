import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { chatIdFor } from '@/lib/utils';
import { ADMIN_MANAGER_ID, ensureAdminManager } from '@/lib/adminManager';

// POST /api/rounds/[id]/payment-reminder … 未入金者へ「運営（管理人）から」入金の催促DMを送る（2026-10-11）
//
// ・主催者／共同主催だけ。入金期日（paymentInfo.deadline）を過ぎているときだけ送れる
// ・宛先＝参加者（applicantIds）のうち入金チェック（paidIds）が無い人。主催者・共同主催・知り合い枠は除く
// ・管理人のDMとして送り、LINE にも必ず届ける（通知設定に関係なく）。リンクはその募集の入金タブ
// ・一度送ったら24時間は再送できない（paymentReminderSentAt）
// ・テスト隔離（lib/testIsolation）は pushTo / addNotification 側で効く
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const COOLDOWN_MS = 24 * 3600 * 1000;

function jst(ms: number): Date { return new Date(ms + 9 * 3600 * 1000); }
function fmtDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${Number(m[2])}月${Number(m[3])}日` : (ymd || '');
}
function fmtDateTime(ms: number): string {
  const d = jst(ms);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const info = (round as any).paymentInfo || {};
  const deadline = Number(info.deadline) || 0;
  if (!deadline) return NextResponse.json({ error: 'no_deadline', message: '入金期日が設定されていません' }, { status: 400, headers: noStore });
  if (Date.now() < deadline) return NextResponse.json({ error: 'before_deadline', message: '入金期日を過ぎてから送れます' }, { status: 400, headers: noStore });
  const last = Number((round as any).paymentReminderSentAt) || 0;
  if (last && Date.now() - last < COOLDOWN_MS) {
    return NextResponse.json({ error: 'cooldown', message: `次に送れるのは ${fmtDateTime(last + COOLDOWN_MS)} 以降です`, nextAt: last + COOLDOWN_MS }, { status: 409, headers: noStore });
  }
  const paid = new Set(round.paidIds || []);
  const hosts = new Set([round.hostId, ...(round.coHostIds || [])]);
  const targets = Array.from(new Set((round.applicantIds || []).filter((id) => id && !hosts.has(id) && !paid.has(id))));
  if (!targets.length) return NextResponse.json({ error: 'no_targets', message: '未入金の参加者はいません' }, { status: 400, headers: noStore });

  // 先に時刻を打つ（連打で二重に送らない）
  await db.updateRound(params.id, { paymentReminderSentAt: Date.now() } as any);

  const host = await db.getUser(round.hostId);
  const title = round.title || round.courseName || 'ラウンド';
  // ゴルトモ公式コンペは運営が参加費を受け取る（/legal/money 第4章）ので、文面を分ける（2026-10-11）
  const official = !!(round as any).isOfficial && !!round.isCompetition && !(round as any).availDate;
  const what = (round as any).eventType === 'drink' ? '飲み会' : (round.isCompetition ? 'ゴルフコンペ' : 'ラウンド');
  const lines = official ? [
    `【ゴルトモ運営よりお知らせ】`,
    `${fmtDate(round.date || '')}の「${title}」は、ゴルトモ運営への事前入金制です。`,
    `入金期日（${fmtDateTime(deadline)}）を過ぎていますので、下記の口座にお振り込みください。`,
    '',
    ...(info.amount ? [`金額：${Number(info.amount).toLocaleString('ja-JP')}円（プレーフィー）`] : []),
    ...(info.account ? [`振込先：${info.account}`] : []),
    '',
    `参加費は当日、運営がゴルフ場へまとめてお支払いします。食事・飲み物などそのほかの費用は、各自でゴルフ場にお支払いください。`,
    `すでにお振り込み済みの場合は、このメッセージにご返信ください。`,
    `お振り込みが確認できない場合、参加を取り消すことがあります。`,
  ] : [
    `【ゴルトモ運営よりお知らせ】`,
    `${fmtDate(round.date || '')}の「${title}」（${what}）は、主催者への事前入金制です。`,
    `入金期日（${fmtDateTime(deadline)}）を過ぎていますので、下記の口座にお振り込みください。`,
    '',
    ...(info.amount ? [`金額：${Number(info.amount).toLocaleString('ja-JP')}円`] : []),
    ...(info.account ? [`振込先：${info.account}`] : []),
    `主催者：${host?.displayName || '主催者'}さん`,
    '',
    `すでにお振り込み済みの場合は、主催者にお知らせください。入金の確認は主催者が行います。`,
    `※お金のやり取りは参加者と主催者のあいだで行われるもので、ゴルトモ運営は入金の受け取り・立て替え・返金には関与しません。`,
  ];
  const text = lines.join('\n').slice(0, 2000);
  const link = `/round/${params.id}?tab=payment`;

  await ensureAdminManager();
  const { addNotification } = await import('@/lib/notifications');
  const { pushTo, liffUrl } = await import('@/lib/linePush');
  let sent = 0;
  for (const uid of targets) {
    try {
      const chatId = chatIdFor(ADMIN_MANAGER_ID, uid);
      const participants = [ADMIN_MANAGER_ID, uid].sort() as [string, string];
      await db.sendMessage(chatId, participants, ADMIN_MANAGER_ID, text);
      await addNotification(uid, 'dm', `💴 「${title}」の入金期日が過ぎています（運営より）`, link).catch(() => {});
      // LINE は通知設定に関係なく必ず送る（未入金の催促は届かないと意味がない）
      await pushTo(uid, `💴【ゴルトモ運営】「${title}」の入金期日が過ぎています。下記から振込先をご確認ください。`, liffUrl(link), 'paymentReminder').catch(() => {});
      sent += 1;
    } catch (e) {
      console.warn('[payment-reminder] send failed', uid, (e as Error).message);
    }
  }
  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, sent, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
