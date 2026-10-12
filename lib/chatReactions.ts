// グループチャットの「押すだけのリアクション」（2026-10-12）。画面とサーバーの両方で使う。
// 保存は英数字のキー（rounds/{id}/chat/{msg}.reactions[key] = [userId...]）。絵文字は画面で描く。
// 絵文字は実行時に作る（ビルドの絵文字エスケープ不具合を避ける）。
export const REACTIONS: Array<{ key: string; emoji: string; label: string }> = [
  { key: 'like', emoji: String.fromCodePoint(0x1F44D), label: 'いいね' },
  { key: 'heart', emoji: String.fromCodePoint(0x2764, 0xFE0F), label: 'すき' },
  { key: 'laugh', emoji: String.fromCodePoint(0x1F602), label: 'わらう' },
  { key: 'clap', emoji: String.fromCodePoint(0x1F44F), label: 'はくしゅ' },
  { key: 'pray', emoji: String.fromCodePoint(0x1F64F), label: 'ありがとう' },
  { key: 'golf', emoji: String.fromCodePoint(0x26F3), label: 'ゴルフ' },
  { key: 'party', emoji: String.fromCodePoint(0x1F389), label: 'やったー' },
];
export const REACTION_KEYS = REACTIONS.map((r) => r.key);
