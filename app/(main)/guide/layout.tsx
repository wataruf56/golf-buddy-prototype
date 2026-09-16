import type { Metadata } from 'next';

// アプリ内の「使い方」ページ（app.goltomo.com/guide）の metadata だけを持つ通し layout。
//
// page.tsx が 'use client' なので metadata を export できず、これまで app/layout.tsx の
// サイト共通 title「ゴルトモ - ゴルフ友達マッチング × AIスイング解析」をそのまま継承していた。
// トップページと同じ title のページが検索結果に並ぶと、最重要の指名KW「ゴルトモ」で
// 自社ページどうしが競合する。
//
// robots.txt では塞げない：`Disallow: /guide` は前方一致なので、記事ハブ /guides と
// /guide/<slug> のSEO記事11本まで巻き込む（/rounds を末尾スラッシュ付きにしたのと同じ罠）。
// next.config.js の headers() も同様で、`/guide/:path*` はホストを問わず効くため記事側に波及する。
// このルート（app/(main)/guide）だけに効く layout を1枚置くのが、記事群に触らずに済む唯一の手。
//
// 使い方ページはアプリを使う人向けのヘルプで、検索の受け皿は /about と /guides が担う。
// クロールは許可したまま（follow）索引だけ止める。
export const metadata: Metadata = {
  title: 'ゴルトモの使い方｜募集に参加する・自分で募集を立てる',
  description:
    'ゴルトモアプリの使い方。誰かのラウンド募集に参加する流れと、自分で募集を立てる流れを、画面の画像つきで説明します。',
  robots: { index: false, follow: true },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
