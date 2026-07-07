import type { UserRestriction } from '@/lib/store';

// 部分制限フラグ → ユーザー向け日本語メッセージ。サーバ側の警告文と揃える。
export const RESTRICTION_MSG: Record<keyof UserRestriction, string> = {
  noCreate: 'ラウンド募集の利用が制限されています。',
  noApplyAll: '参加申し込みの利用が制限されています。',
  noInvite: 'ゴルトモ招待の利用が制限されています。',
  noChat: 'チャットの利用が制限されています。',
  noDM: 'ダイレクトメッセージの利用が制限されています。',
  noInterest: '「気になる」の利用が制限されています。',
  noReview: 'レビュー投稿の利用が制限されています。',
  applyBlockHostIds: 'この主催者のラウンドへの参加申し込みは制限されています。',
};

// 指定機能が制限されているかを判定（クライアントの事前ブロック用）。
export function isRestricted(r: UserRestriction | undefined | null, flag: keyof UserRestriction): boolean {
  if (!r) return false;
  return !!(r as any)[flag];
}
