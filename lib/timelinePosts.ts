import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort } from './ageGate';
import { REACTION_KEYS } from './chatReactions';

// タイムラインの「今日の写真」（2026-10-17）。ラウンド後の相互レビューの画面で、写真1枚＋ひとこと（任意）を投稿する。
// タイムラインに「◯◯さんが投稿しました／M/D（曜）のラウンドの投稿です」として流れ、いいね・リアクションが付けられる。
// 保存：timelinePosts/{roundId}_{userId}（1募集につき1人1枚・投稿し直すと置き換え）。画像は dataURL（1MB未満）で
//   ドキュメントに入れ、タイムラインには /api/timeline/posts/[id]/image の URL だけを返す（一覧が重くならないように）。
// 見られるのは同じ年代（コホート）の会員だけ。テスト垢の投稿はテスト垢にだけ。リアクションは誰が押したかは返さない（数と自分の分だけ）。
// 同じ写真はその募集のアルバム（rounds/{id}/photos）にも入れる。
export const POSTS = 'timelinePosts';
export const MAX_IMAGE_LEN = 950_000;
export const MAX_CAPTION = 100;

export type TimelinePost = {
  userId: string; roundId: string; roundDate?: string; roundLabel?: string;
  text?: string; image: string; createdAt: number; cohort: string; test?: boolean;
  reactions?: Record<string, string[]>;
};

export const postId = (roundId: string, userId: string) => `${roundId}_${userId}`;

export function reactionView(reactions: Record<string, string[]> | undefined, viewerId: string) {
  const counts: Record<string, number> = {};
  const mine: string[] = [];
  for (const k of REACTION_KEYS) {
    const list = (reactions || {})[k] || [];
    if (list.length) counts[k] = list.length;
    if (list.includes(viewerId)) mine.push(k);
  }
  return { counts, mine, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** この人がこの投稿を見られるか（同じ年代・テスト垢の投稿はテスト垢だけ） */
export async function canSeePost(post: TimelinePost, viewer: { id: string; age?: number }): Promise<boolean> {
  const { viewCohort } = await import('./ageGate');
  if (viewCohort(viewer.age) !== post.cohort) return false;
  if (post.test) {
    const { isTestAccount } = await import('./testAccounts');
    if (!(viewer.id.startsWith('test_') || (await isTestAccount(viewer.id)))) return false;
  }
  return true;
}

export async function getPost(id: string): Promise<TimelinePost | null> {
  const adb = getAdminDb() as any;
  if (!adb) return null;
  const s = await adb.collection(POSTS).doc(id).get();
  return s.exists ? (s.data() as TimelinePost) : null;
}

export function cohortOf(age?: number) { return getCohort(age) || 'a'; }
