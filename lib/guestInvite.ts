import 'server-only';
import crypto from 'crypto';

// ゲスト招待リンク（2026-10-08）
// 主催者が知り合い枠に名前を入れたゲスト（gst_…）ごとに、その人専用のリンクを作る。
// リンクを開いた人が LINE で登録（LIFF ログイン＋友だち追加＋プロフィール）すると、
// そのゲストの枠がその人に置き換わる（配車・入金・組み分けもそのまま引き継ぐ）。
//
// トークンは保存しない（募集ID＋ゲストIDの HMAC）。ゲストが置き換わって消えれば、リンクも自然に無効になる。

function secret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.ADMIN_LOG_TOKEN || 'goltomo-guest-invite';
}

export function guestInviteToken(roundId: string, guestId: string): string {
  return crypto.createHmac('sha256', secret()).update(`guest-invite:${roundId}:${guestId}`).digest('base64url').slice(0, 22);
}

export function verifyGuestInviteToken(roundId: string, guestId: string, token: string): boolean {
  if (!roundId || !guestId || !token) return false;
  const expected = guestInviteToken(roundId, guestId);
  const a = Buffer.from(expected); const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** アプリ内のパス（LIFF の ?to= に渡す） */
export function guestInvitePath(roundId: string, guestId: string): string {
  return `/invite/${roundId}?g=${encodeURIComponent(guestId)}&t=${guestInviteToken(roundId, guestId)}`;
}
