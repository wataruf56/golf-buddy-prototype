import 'server-only';
import { db } from './db';
import { pushTo, liffUrl } from './linePush';
import { webPushText } from './webPush';
import { isNotifyEnabled } from './notifyPrefs';
import { isMatchingAllowedByAge, getCohort, isMatchingAllowedUser, userCohort } from './ageGate';
import { checkRoundEligibility, canGenderJoin } from './roundEligibility';
import { isRoundHost } from './roundHost';
import { formatDate } from './utils';
import type { Round, User, Gender } from './types';

// ラウンドへの招待（2026-10-13 共通化）。
//
// 主催者の招待（POST /api/rounds/[id]/invite）と、運営が管理画面から代わりに送る招待
// （/api/admin/round-invite）の**両方がここを通る**。だから招待された人が受け取るものは同じ：
//   ・round.invitedIds に入る → ホームの「ラウンドに招待されています」、募集ページの 💌 バナー、
//     「参加する」で承認待ちを経由せず即参加（/api/rounds/[id]/accept-invite）
//   ・アプリ内お知らせ（必ず）＋ LINE / スマホ通知（本人の「💌 ラウンドに招待された」設定がONのとき）
// 違うのは文面だけ：主催者なら通知テンプレート 'invited'、運営なら 'invitedByAdmin'。
// 通知は addNotification / pushTo を通すので、テスト垢の募集なら自動でテスト垢＋管理者だけに絞られる（lib/testIsolation）。

export type InviteBy = 'host' | 'admin';

/** 通知・画面に出す開催日時（例「7/25（土） 8:30」）。日付が無い募集は日付の幅か「日程調整中」。 */
export function roundWhenLabel(r: Pick<Round, 'date' | 'dateRange' | 'startTime'>): string {
  const d = r.date ? formatDate(r.date) : (r.dateRange || '');
  return [d, r.startTime || ''].filter(Boolean).join(' ') || '日程調整中';
}

/**
 * 招待を1件送る。すでに招待済みなら何も送らない（added=false）。
 * 一言（message）は空でなければ round.inviteMessages に保存して、本人が募集を開いたときにも見えるようにする。
 */
export async function sendRoundInvite(opts: {
  round: Round;
  inviteeId: string;
  by: InviteBy;
  message?: string;
}): Promise<{ round: Round; added: boolean }> {
  const { round: existing, inviteeId, by } = opts;
  const message = String(opts.message || '').trim().slice(0, 200);
  const { round, added } = await db.inviteToRound(existing.id, inviteeId);

  const patch: Partial<Round> = {};
  if (message) patch.inviteMessages = { ...(round.inviteMessages || {}), [inviteeId]: message };
  if ((round.revokedIds || []).includes(inviteeId)) patch.revokedIds = (round.revokedIds || []).filter((x) => x !== inviteeId);   // 取り消した人を招待し直した
  if (added) {
    patch.invitedBy = { ...(round.invitedBy || {}), [inviteeId]: by };
    patch.invitedAt = { ...(round.invitedAt || {}), [inviteeId]: Date.now() };
  }
  if (Object.keys(patch).length) {
    await db.updateRound(existing.id, patch);
    Object.assign(round, patch);
  }

  if (added) {
    const invitee = await db.getUser(inviteeId);
    const host = await db.getUser(existing.hostId);
    const hostName = host?.displayName || '募集者';
    const link = `/round/${existing.id}`;
    const hitokoto = message ? `\n「${message}」` : '';
    const { renderNotif } = await import('./notificationTemplateStore');
    // 非公開の招待（visibility='invite'）は「招待状」の文面に（2026-10-14・テンプレート invitedPrivate）
    const { isPrivateRound } = await import('./roundAccess');
    const { isEventRound, eventKindMeta } = await import('./eventRound');
    const kindLabel = existing.eventType === 'drink' ? (isEventRound(existing) ? eventKindMeta(existing.eventKind).label : '飲み会') : 'ラウンド';
    const when = existing.eventDatePending ? '日程調整中' : roundWhenLabel(existing);
    const n = isPrivateRound(existing)
      ? await renderNotif('invitedPrivate', { '主催者名': hostName, '募集タイトル': existing.title, '日時': when, '種類': kindLabel, 'ひとこと': hitokoto })
      : by === 'admin'
      ? await renderNotif('invitedByAdmin', { '募集タイトル': existing.title, '日時': roundWhenLabel(existing), '主催者名': hostName, 'ひとこと': hitokoto })
      : await renderNotif('invited', { '主催者名': hostName, '募集タイトル': existing.title, 'ひとこと': hitokoto });
    const { addNotification } = await import('./notifications');
    if (n.inApp) addNotification(inviteeId, 'invited', n.inApp, link).catch(() => {});
    if (isNotifyEnabled(invitee as any, 'invited')) {
      pushTo(inviteeId, n.line, liffUrl(link), by === 'admin' ? 'invited_admin' : 'invited').catch(() => {});
      webPushText(inviteeId, n.webTitle, n.webBody, link, `invite-${existing.id}`).catch(() => {});
    }
  }
  return { round, added };
}

// ─────────────────────────────────────────────────────────────────────────────
// 運営が代わりに招待するときの「この人を誘ってよいか」。
// 主催者の招待は主催者が自分で選んだ相手なので、承認時（accept-invite）に性別枠・初心者条件を見ない。
// 運営の招待は主催者が選んでいないので、**参加申請（/api/rounds/[id]/join）と同じ条件**を満たす人だけにする。
// ─────────────────────────────────────────────────────────────────────────────

/** 募集そのものが「代わりに招待」できる状態か。だめなら理由。 */
export function roundInviteBlock(round: Round): string | null {
  if (round.status !== 'open') return '募集中ではありません';
  if ((round as any).official) return '運営枠（枠を選んで参加する募集）は対象外です';
  if ((round.currentCount || 0) >= (round.maxSpots || 0)) return '満員です';
  return null;
}

export type InviteContext = {
  round: Round;
  host: User | null;
  /** 参加確定している人の性別（男女別の枠の判定用。lib/genderSlotsServer.memberGendersFromDb） */
  approvedGenders: Array<Gender | undefined>;
  banned: Set<string>;
  restrictions: Record<string, { noApplyAll?: boolean; applyBlockHostIds?: string[] }>;
  isTestId: (id: string) => boolean;
  isTestRound: boolean;
};

/**
 * この人を代わりに招待できない理由。招待できるなら null。
 * kind='hide' は候補に出さない人（主催者・参加済み・BAN・テスト垢など）、'ng' は条件が合わない人（検索では理由つきで見せる）。
 */
export function inviteeBlock(user: User | null | undefined, ctx: InviteContext): { kind: 'hide' | 'ng' | 'invited'; reason: string } | null {
  const { round } = ctx;
  if (!user) return { kind: 'hide', reason: '退会済み' };
  const id = user.id;
  if (isRoundHost(round, id)) return { kind: 'hide', reason: '主催者' };
  if ((round.applicantIds || []).includes(id)) return { kind: 'hide', reason: '参加済み' };
  if ((round.pendingApplicantIds || []).includes(id)) return { kind: 'hide', reason: '参加申請中' };
  if (ctx.banned.has(id)) return { kind: 'hide', reason: '利用停止中' };
  // テスト垢はテストの募集にだけ。テストの募集には実ユーザーを入れない（通知も隔離で落ちるため）。
  if (ctx.isTestId(id) !== ctx.isTestRound) return { kind: 'hide', reason: ctx.isTestRound ? '実ユーザー（テストの募集）' : 'テストアカウント' };
  if ((round.invitedIds || []).includes(id)) return { kind: 'invited', reason: '招待済み' };
  if (!isMatchingAllowedUser(user)) return { kind: 'ng', reason: '年齢が未入力か対象外' };
  if (round.hostCohort && userCohort(user) !== round.hostCohort) return { kind: 'ng', reason: '年代が違う' };
  if ((ctx.host?.blockedUserIds || []).includes(id)) return { kind: 'ng', reason: '主催者がブロック中' };
  const rst = ctx.restrictions[id];
  if (rst?.noApplyAll || (rst?.applyBlockHostIds || []).includes(round.hostId)) return { kind: 'ng', reason: '参加申込を制限中' };
  const elig = checkRoundEligibility(round, user);
  if (!elig.ok) {
    const r = elig.code === 'beginner_only' ? '初心者のみの募集' : elig.code === 'male_only' ? '男性のみの募集' : '女性のみの募集';
    return { kind: 'ng', reason: r };
  }
  if (!canGenderJoin(round, ctx.approvedGenders, user.gender)) {
    const g = user.gender === 'male' ? '男性' : user.gender === 'female' ? '女性' : '性別未設定の人';
    return { kind: 'ng', reason: `${g}の枠が満員` };
  }
  return null;
}

/** InviteContext を DB から組み立てる。 */
export async function buildInviteContext(round: Round): Promise<InviteContext> {
  const { warmTestIds, isTestId, isTestRound } = await import('./testAccounts');
  await warmTestIds();
  const [host, approvedGenders, banned, restrictions] = await Promise.all([
    db.getUser(round.hostId).catch(() => null),
    import('./genderSlotsServer').then((m) => m.memberGendersFromDb(round)),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./banAccess').then((m) => m.listRestrictions()).catch(() => ({})),
  ]);
  return {
    round, host: host || null, approvedGenders, banned,
    restrictions: restrictions as InviteContext['restrictions'],
    isTestId: (id: string) => isTestId(id),
    isTestRound: isTestRound(round),
  };
}
