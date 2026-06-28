import type { User } from '@/lib/types';
import { golmotiImg } from '@/lib/golmoti';

// アイコン表示。avatarMode で優先順位が決まる:
//   'golmoti' → 診断アイコン（golmotiType がある場合）
//   'photo'   → アップロード写真（avatarUrl がある場合）
//   'emoji'   → 絵文字（男女マーク等）
// avatarMode 未設定の旧データは「写真があれば写真／無ければ絵文字」で後方互換。
export function Avatar({
  user,
  size = 40,
  emojiSize,
}: {
  user: Pick<User, 'avatar' | 'avatarUrl' | 'color' | 'avatarMode' | 'golmotiType'> | undefined;
  size?: number;
  emojiSize?: number;
}) {
  const fontSize = emojiSize ?? Math.round(size * 0.5);
  const bg = user?.color ? `${user.color}22` : '#DCEFEA';
  const mode = user?.avatarMode;

  // 診断アイコン
  if (mode === 'golmoti' && user?.golmotiType) {
    return (
      <img
        src={golmotiImg(user.golmotiType)}
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size, background: bg }}
      />
    );
  }

  // 写真（明示 photo、または未設定＋avatarUrlあり＝旧データ互換）。emoji/golmoti 指定時は出さない。
  if (user?.avatarUrl && mode !== 'emoji' && mode !== 'golmoti') {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  // 絵文字（デフォルト）
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: bg, fontSize }}
    >
      {user?.avatar || '⛳'}
    </div>
  );
}
