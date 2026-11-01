import 'server-only';
import crypto from 'crypto';
import { getAdminDb } from './firebase';
import { isAdminUserId } from './adminAccess';

// 運営が LINE を通さずに「自分のアカウント」でアプリを開くための使い捨てリンク（2026-11-01・本人要望
// 「テスト版を見たいので、私だけ LINE ログインせず URL から自分として見たい」）。
//   発行：GCP の権限がある PC から 05_テスト/goltomo_testenv.py applink（NEXTAUTH_SECRET で署名）。
//         管理画面は今パスワードなしで開けるので、管理画面からは発行できないようにしてある。
//   使う：app.goltomo.com/api/auth/app-link?k=… → __session を発行して画面へ
// 安全策：入れるのは運営（ADMIN_USER_IDS）だけ／発行から10分で切れる／1回使ったら二度と使えない（_authLinks に記録）。
export const APP_LINK_TTL_MS = 10 * 60 * 1000;

function sign(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// トークンの形：applink.<userId>.<発行ミリ秒>.<乱数>.<HMAC-SHA256(先頭4つ, NEXTAUTH_SECRET) base64url>
/** 正しければ userId。1回使ったものは null（この呼び出しで「使った」記録を付ける） */
export async function consumeAppLinkToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'applink') return null;
  const [, userId, ts, nonce, sig] = parts;
  const expected = sign(`applink.${userId}.${ts}.${nonce}`, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const at = parseInt(ts, 10);
  if (!Number.isFinite(at) || Date.now() - at > APP_LINK_TTL_MS || at > Date.now() + 60_000) return null;
  if (!isAdminUserId(userId)) return null;
  const adb = getAdminDb() as any;
  if (!adb) return null;
  try {
    // create は同じ id があると失敗する → 2回目は通らない
    await adb.collection('_authLinks').doc(nonce).create({ userId, issuedAt: at, usedAt: Date.now() });
  } catch {
    return null;
  }
  return userId;
}
