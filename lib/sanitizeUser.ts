import type { User } from './types';

// Real (kanji) names are private: never expose them in multi-user API responses.
// They reach the round host only via /api/rounds/[id]/participant-names, and the
// user themselves via /api/me. Strip them everywhere else.
//
// `selfId` keeps the current user's own real name intact (so the profile edit
// form, which reads from the bootstrap `me`, can prefill it). Pass null to strip
// for everyone.
export function stripPrivate(user: User, selfId?: string | null): User {
  if (selfId && user.id === selfId) return user;
  // 実名・友達リスト・最寄り駅は本人以外に見せない。
  // 最寄り駅は運営がピックアップ調整に使うためのもので、会員同士では出さない約束（入力欄に明記）。
  // チャットを見た時刻・毎月のお知らせを見た記録も本人だけのもの（2026-10-12）
  // 誕生日も本人だけ（ほかの人には年齢だけ）（2026-10-20）
  const { realNameLast, realNameFirst, friendIds, nearestStation, roundChatSeen, availMonthlySeen, birthday, ...rest } = user as any;
  return rest as User;
}

export function stripPrivateMany(users: User[], selfId?: string | null): User[] {
  return users.map((u) => stripPrivate(u, selfId));
}
