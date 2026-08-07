import 'server-only';
import { IgPost, updateIgPost } from '@/lib/igPosts';
import {
  igContainerStatus, igCreateReelContainer, igPublishPost, igPublishReadyContainer,
} from '@/lib/igPublish';

// 公開を1段階だけ進める。手動公開（/api/admin/ig/[id]）と
// 予約公開（/api/cron/ig-publish-due）の両方がここを通る。
//
// 写真とカルーセルは1回のリクエストで公開まで終わる。
// リールは Instagram 側の動画変換に数分かかることがあり、Cloud Run の
// リクエスト上限（300秒）を超えうる。そこで
//   1) コンテナを作って id を控える
//   2) しばらく待つ。間に合えば公開して終わり
//   3) 間に合わなければ status='publishing' のまま残し、次の巡回で仕上げる
// という二段構えにしている。コンテナは24時間で失効するので作り直す。

const CONTAINER_TTL_MS = 23 * 60 * 60 * 1000;
/** 変換待ちを諦めて次の巡回に回すまで。Cloud Run の300秒に余裕を持たせる。 */
const INLINE_WAIT_MS = 150 * 1000;

export type PublishResult =
  | { state: 'published'; mediaId: string }
  | { state: 'pending'; containerId: string };

export async function advancePublish(p: IgPost): Promise<PublishResult> {
  if (p.mediaType !== 'REELS') {
    const mediaId = await igPublishPost(p.imageUrls, p.caption);
    return { state: 'published', mediaId };
  }

  if (!p.videoUrl) throw new Error('動画URLがありません');

  // 使い回せるコンテナがあれば使う。古ければ作り直す。
  let containerId = p.containerId || '';
  const fresh = p.containerAt && Date.now() - p.containerAt < CONTAINER_TTL_MS;
  if (!containerId || !fresh) {
    containerId = await igCreateReelContainer(p.videoUrl, p.caption, p.coverUrl || undefined);
    await updateIgPost(p.id, { containerId, containerAt: Date.now() });
  }

  const until = Date.now() + INLINE_WAIT_MS;
  for (;;) {
    const code = await igContainerStatus(containerId);
    if (code === 'FINISHED') {
      const mediaId = await igPublishReadyContainer(containerId);
      return { state: 'published', mediaId };
    }
    if (code === 'ERROR') throw new Error('動画の変換に失敗しました（形式や長さを確認してください）');
    if (code === 'EXPIRED') throw new Error('コンテナが失効しました。やり直してください');
    if (Date.now() >= until) return { state: 'pending', containerId };
    await new Promise((r) => setTimeout(r, 5000));
  }
}
