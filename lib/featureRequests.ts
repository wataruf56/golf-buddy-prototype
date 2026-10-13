// 💡 改修要望（システム要望）の共通定数。クライアント／サーバー両用（server-only な db は読まない）。
//
// 「もっとこういう機能があったらいいのに」「こういう仕様だったらいいのに」を会員が運営に伝える窓口（2026-10-13）。
//   - 要望を上げた人ごとにスレッド（featureRequests/{id}）ができ、その中で運営とチャットする
//   - ほかの会員もスレッドを読める（書けるのは本人と運営だけ）。ほかの会員は「👍 ほしい」で後押しできる
//   - 運営は管理画面 /admin/requests から返信・状態変更・ピン留め
//
// 絵文字は SWC の定数畳み込みでエスケープのまま届くことがあるので、lib の定数は String.fromCodePoint で作る。

export type FeatureRequestStatus = 'new' | 'reviewing' | 'working' | 'done' | 'declined';
export type FeatureRequestCategory = 'feature' | 'usability' | 'bug' | 'other';

export const FEATURE_REQUEST_STATUSES: FeatureRequestStatus[] = ['new', 'reviewing', 'working', 'done', 'declined'];
export const FEATURE_REQUEST_CATEGORIES: FeatureRequestCategory[] = ['feature', 'usability', 'bug', 'other'];

const E = (...cp: number[]) => String.fromCodePoint(...cp);
const EMOJI = {
  new: E(0x1f195),            // 🆕
  reviewing: E(0x1f440),      // 👀
  working: E(0x1f6e0, 0xfe0f), // 🛠️
  done: E(0x2705),            // ✅
  declined: E(0x1f64f),       // 🙏
  bulb: E(0x1f4a1),           // 💡
  shield: E(0x1f6e1, 0xfe0f), // 🛡️
  thumb: E(0x1f44d),          // 👍
};

export const FEATURE_REQUEST_EMOJI = { bulb: EMOJI.bulb, shield: EMOJI.shield, thumb: EMOJI.thumb };

/** 状態のラベル（絵文字つき）と色クラス。一覧のバッジ・詳細のヘッダ・管理画面の絞り込みで共通に使う。 */
export const FEATURE_REQUEST_STATUS_META: Record<FeatureRequestStatus, { label: string; short: string; className: string; desc: string }> = {
  new:       { label: `${EMOJI.new} 受付`,     short: '受付',   className: 'text-blue bg-blue-light border-blue',        desc: '届いたばかり。運営がまだ目を通していない' },
  reviewing: { label: `${EMOJI.reviewing} 検討中`, short: '検討中', className: 'text-orange bg-orange-light border-orange', desc: '運営が内容を確認・検討している' },
  working:   { label: `${EMOJI.working} 対応中`,  short: '対応中', className: 'text-purple-600 bg-purple-100 border-purple-600', desc: '実装・修正に取りかかっている' },
  done:      { label: `${EMOJI.done} 対応済み`,  short: '対応済み', className: 'text-green bg-green-light border-green',   desc: 'アプリに反映した' },
  declined:  { label: `${EMOJI.declined} 見送り`, short: '見送り', className: 'text-sub bg-bg border-border',              desc: '今回は見送り（理由はスレッドに書く）' },
};

export const FEATURE_REQUEST_CATEGORY_LABEL: Record<FeatureRequestCategory, string> = {
  feature: '機能の追加',
  usability: '使いにくい',
  bug: '不具合っぽい',
  other: 'その他',
};

export const FEATURE_REQUEST_TITLE_MAX = 60;
export const FEATURE_REQUEST_BODY_MAX = 1000;
export const FEATURE_REQUEST_MESSAGE_MAX = 1000;

/** スレッドのメッセージで、運営（管理画面からの返信）を表す送信者ID。 */
export const FEATURE_REQUEST_ADMIN_SENDER = 'admin';
export const FEATURE_REQUEST_ADMIN_NAME = `${EMOJI.shield} ゴルトモ運営`;

export const isFeatureRequestStatus = (v: unknown): v is FeatureRequestStatus =>
  typeof v === 'string' && (FEATURE_REQUEST_STATUSES as string[]).includes(v);
export const isFeatureRequestCategory = (v: unknown): v is FeatureRequestCategory =>
  typeof v === 'string' && (FEATURE_REQUEST_CATEGORIES as string[]).includes(v);

/** 一覧・詳細で返す要望スレッド（API のレスポンス形）。 */
export type FeatureRequestAuthor = {
  id: string;
  displayName: string;
  avatar?: string;
  avatarUrl?: string;
  avatarMode?: string;
  golmotiType?: string;
  color?: string;
};

export type FeatureRequestItem = {
  id: string;
  authorId: string;
  author: FeatureRequestAuthor;
  title: string;
  body: string;
  category: FeatureRequestCategory;
  status: FeatureRequestStatus;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessage: string;
  lastSenderId: string;
  replyCount: number;
  voteCount: number;
  voted: boolean;
  pinned: boolean;
  mine: boolean;
};

export type FeatureRequestMessage = {
  id: string;
  senderId: string;   // 'admin'（運営）または 会員の userId
  text: string;
  createdAt: number;
};
