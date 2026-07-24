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
  | 'roundUpcoming'  // 参加ラウンドの開催が近づいた事前リマインド（1ヶ月前/1週間前/前日）
  | 'invited'        // I was invited to a round by the host
  | 'interestReceived' // someone marked my round as "気になる" (host)
  | 'interestDeadline' // a round I'm "気になる" about is closing soon
  | 'match'            // マッチ成立（また回りたい / 異性として気になる）
  | 'surveyMatch'      // LP診断アンケートで希望した条件（県）に一致する募集が投稿された
  | 'rematch'          // 再会エンジン：また回りたい相手との再会のお知らせ・候補日の往復
  | 'groupChange'      // 参加者から「組分けの変更を希望」が届いた（主催者）
  | 'pickup';          // 主催者からピックアップ場所（駅）の提案が届いた

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
  { key: 'roundUpcoming',  label: '📅 開催前リマインド',     desc: '参加ラウンドの1ヶ月前・1週間前・前日にお知らせ', defaultOn: true },
  { key: 'invited',          label: '💌 ラウンドに招待された', desc: '募集者からラウンドに招待されたとき', defaultOn: true },
  { key: 'interestReceived', label: '💚 「気になる」が押された', desc: '自分の募集に「気になる」が押されたとき', defaultOn: true },
  { key: 'interestDeadline', label: '⏰ 気になるラウンドの締切間近', desc: '「気になる」した募集の開催が近づいたとき', defaultOn: true },
  { key: 'match',            label: '💘 マッチ成立', desc: 'ラウンド後にマッチしたとき', defaultOn: true },
  { key: 'surveyMatch',      label: '🎯 希望条件に合う募集', desc: '診断アンケートで希望したエリアの募集が投稿されたとき', defaultOn: true },
  { key: 'rematch',          label: '🔁 再会のお知らせ', desc: 'また回りたい相手との再会・候補日のやり取りがあったとき', defaultOn: true },
  { key: 'groupChange',      label: '🔀 組分けの変更希望', desc: '自分のコンペで参加者が組分けの変更を希望したとき（主催者）', defaultOn: true },
  { key: 'pickup',           label: '🚉 ピックアップの提案', desc: '主催者からピックアップ場所の提案が届いたとき', defaultOn: true },
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
