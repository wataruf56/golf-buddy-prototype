import type { User } from '@/lib/types';

export function Avatar({
  user,
  size = 40,
  emojiSize,
}: {
  user: Pick<User, 'avatar' | 'avatarUrl' | 'color'> | undefined;
  size?: number;
  emojiSize?: number;
}) {
  const fontSize = emojiSize ?? Math.round(size * 0.5);
  const bg = user?.color ? `${user.color}22` : '#DCEFEA';
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: bg, fontSize }}
    >
      {user?.avatar || '⛳'}
    </div>
  );
}
