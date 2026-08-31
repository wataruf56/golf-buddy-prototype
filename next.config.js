/** @type {import('next/config').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so we can run the
  // app in a small Docker container on Cloud Run. No effect on Vercel.
  output: 'standalone',
  // Clean URL for the ゴルフ性格診断 (GOLMOTI) static LP in /public.
  // /golmoti → public/golmoti.html
  async rewrites() {
    return [
      { source: '/golmoti', destination: '/golmoti.html' },
    ];
  },
  // 旧「GOLMOTI／ゴルモチ」表記の紹介LP（試作）は廃止した。ブランドは「ゴルトモ」に
  // 統一する方針で、旧称のページが検索に出たり共有リンクから開かれたりするのを避ける。
  // どこからもリンクされていないが、過去に共有されたURLが生きている可能性があるので
  // 消すのではなく現行の診断LPへ恒久リダイレクトする。
  // 注意：middleware の許可リストから /golmoti-lp を外すと、ここに来る前に /lp へ
  // rewrite されてこのリダイレクトが効かなくなる。
  // 募集の詳細ページ（/round/[id]）を検索結果に出さない。
  //
  // 募集は数週間で終わる使い捨てのページなので、育てても実らないうちに終わる。
  // それが何十件も索引されると、最重要の指名KW「ゴルトモ」で**自社の終わった募集
  // どうしが競合**して本命のLPを押し下げるうえ、参加者の名前が検索結果に出うる。
  //
  // robots.txt で塞がないのは、**クロールは許可したままにしたいから**。
  // 募集ページは X や LINE でシェアされる主戦場で、塞ぐとプレビューカードが死ぬ。
  // X-Robots-Tag なら「読んでよいが索引には入れるな」と伝えられる。
  // follow を付けているのは、ページ内のリンク（LPや使い方）は辿ってほしいため。
  async headers() {
    return [
      {
        source: '/round/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/golmoti-lp', destination: '/golmoti.html', permanent: true },
      { source: '/golmoti-lp.html', destination: '/golmoti.html', permanent: true },
    ];
  },
};

module.exports = nextConfig;
