// Per-user, per-type notification preferences for the LINE official account
// (and web push). Users pick which events ping their LINE; only enabled types
// fire. Stored on the user doc as `notifyPrefs: Record<NotifyType, boolean>`.

export type NotifyType =
  | 'dm'              // 1:1 DM received
  | 'mention'        // mentioned in a round group chat
  | 'applyReceived'  // someone applied to my round (host)
  | 'applyApproved'  // my application was approved (applicant)
  | 'review'         // a review was posted about me
  | 'roundChat'      // any message in a round group chat I'm in
  | 'swing'          // my swing analysis finished
  | 'reviewReminder' // post-round "please review" reminder
  | 'invited'        // I was invited to a round by the host
  | 'interestReceived' // someone marked my round as "気になる" (host)
  | 'interestDeadline';// a round I'm "気になる" about is closing soon

// Display metadata for the settings UI. Order = display order.
export const NOTIFY_TYPES: Array<{ key: NotifyType; label: string; desc: string; defaultOn: boolean }> = [
  { key: 'dm',             label: '💬 ダイレクトメッセージ', desc: '1対1のメッセージが届いたとき', defaultOn: true },
  { key: 'mention',        label: '📣 メンション',           desc: 'グループチャットで自分が指名されたとき', defaultOn: true },
  { key: 'applyReceived',  label: '🆕 参加申請が届いた',     desc: '自分の募集に参加申請が来たとき', defaultOn: true },
  { key: 'applyApproved',  label: '✅ 参加が承認された',     desc: '申し込んだ募集が承認されたとき', defaultOn: true },
  { key: 'review',         label: '⭐ レビューが届いた',     desc: '自分へのレビューが投稿されたとき', defaultOn: true },
  { key: 'roundChat',      label: '🏌️ ラウンドチャット',     desc: '参加ラウンドのグループチャットの新着（多めに届きます）', defaultOn: false },
  { key: 'swing',          label: '📊 スイング解析の完了',   desc: 'AI解析が終わったとき', defaultOn: true },
  { key: 'reviewReminder', label: '📝 レビューのお願い',     desc: 'ラウンド後にレビューを促す通知', defaultOn: true },
  { key: 'invited',          label: '💌 ラウンドに招待された', desc: '募集者からラウンドに招待されたとき', defaultOn: true },
  { key: 'interestReceived', label: '💚 「気になる」が押された', desc: '自分の募集に「気になる」が押されたとき', defaultOn: true },
  { key: 'interestDeadline', label: '⏰ 気になるラウンドの締切間近', desc: '「気になる」した募集の開催が近づいたとき', defaultOn: true },
];

const DEFAULTS: Record<NotifyType, boolean> = NOTIFY_TYPES.reduce((acc, t) => {
  acc[t.key] = t.defaultOn;
  return acc;
}, {} as Record<NotifyType, boolean>);

export function defaultNotifyPrefs(): Record<NotifyType, boolean> {
  return { ...DEFAULTS };
}

/**
 * Resolve whether a given notify type is enabled for a user.
 * - Honours the legacy global `notifyOff` (true = everything off).
 * - Falls back to the type's default when the user hasn't set a preference.
 */
export function isNotifyEnabled(
  user: { notifyOff?: boolean; notifyPrefs?: Partial<Record<NotifyType, boolean>> } | null | undefined,
  type: NotifyType,
): boolean {
  if (!user) return false;
  if (user.notifyOff) return false; // master switch off
  const prefs = user.notifyPrefs || {};
  if (type in prefs && typeof prefs[type] === 'boolean') return !!prefs[type];
  return DEFAULTS[type];
}
