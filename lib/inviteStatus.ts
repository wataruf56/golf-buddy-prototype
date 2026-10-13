import type { Round } from './types';

// 招待の返事の状況（2026-10-13）。招待した側（主催者・共同管理者・運営）が
// 「まだ見ていない」のか「見たけど返事がない」のか「行けない」のか「参加した」のかを把握するため。
// 画面（募集ページの「💌 招待した人」）と管理画面（/api/admin/round-invite）で同じ判定を使う。
//
// 呼び方は「行けない」。「拒否」「お断り」とは書かない（招待された人の気持ちに寄せる）。

export type InviteStatusKind = 'unread' | 'seen' | 'declined' | 'joined' | 'applied';

export type InviteStatus = {
  kind: InviteStatusKind;
  invitedAt: number | null;
  seenAt: number | null;
  declinedAt: number | null;
  reason: string | null;
};

/** 「行けない」の一言（任意）。押さなくても返事はできる。 */
export const DECLINE_REASONS = ['日程が合わない', '今回は見送ります', '別の予定が入った', '遠くて行けない'] as const;

/**
 * この人への招待の状況。招待したことが無い（記録が何も無い）なら null。
 * 招待中（invitedIds に入っている）なら、既読は「今回の招待のあとに見たか」で判断する
 * （招待し直す前の既読を引きずらない）。
 */
export function inviteStatusOf(
  round: Pick<Round, 'invitedIds' | 'invitedAt' | 'inviteSeenAt' | 'inviteDeclined' | 'invitedBy' | 'applicantIds' | 'pendingApplicantIds'>,
  uid: string,
): InviteStatus | null {
  const invitedAt = (round.invitedAt || {})[uid] || null;
  const seenRaw = (round.inviteSeenAt || {})[uid] || null;
  const seenAt = seenRaw && (!invitedAt || seenRaw >= invitedAt) ? seenRaw : null;
  const dec = (round.inviteDeclined || {})[uid];
  const base = { invitedAt, seenAt, declinedAt: null as number | null, reason: null as string | null };
  const wasInvited = !!invitedAt || !!(round.invitedBy || {})[uid];
  if ((round.applicantIds || []).includes(uid)) return wasInvited ? { ...base, kind: 'joined' } : null;
  if ((round.invitedIds || []).includes(uid)) {
    if ((round.pendingApplicantIds || []).includes(uid)) return { ...base, kind: 'applied' };
    return { ...base, kind: seenAt ? 'seen' : 'unread' };
  }
  if (dec) return { ...base, kind: 'declined', declinedAt: dec.at || null, reason: dec.reason || null };
  return null;
}

const fmt = (ms: number) => new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 表示用の文言（例「既読 10/13 14:05」）。 */
export function inviteStatusLabel(s: InviteStatus): string {
  switch (s.kind) {
    case 'unread': return '未読（まだ見ていません）';
    case 'seen': return `既読 ${s.seenAt ? fmt(s.seenAt) : ''}`.trim();
    case 'declined': return `行けない${s.declinedAt ? `（${fmt(s.declinedAt)}）` : ''}`;
    case 'joined': return '参加した';
    case 'applied': return '参加申請中';
  }
}

/** 招待した時刻の表示（例「10/13 14:00 に招待」）。 */
export function invitedAtLabel(s: InviteStatus): string {
  return s.invitedAt ? `${fmt(s.invitedAt)} に招待` : '';
}

/** 状態ごとの色（Tailwind のクラス）。 */
export function inviteStatusTone(kind: InviteStatusKind): string {
  switch (kind) {
    case 'unread': return 'text-muted bg-bg border border-border';
    case 'seen': return 'text-blue bg-card border border-blue';
    case 'declined': return 'text-orange bg-orange-light border border-orange';
    case 'joined': return 'text-green bg-green-light border border-green';
    case 'applied': return 'text-orange bg-yellow-light border border-orange';
  }
}
