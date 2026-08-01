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
  async redirects() {
    return [
      { source: '/golmoti-lp', destination: '/golmoti.html', permanent: true },
      { source: '/golmoti-lp.html', destination: '/golmoti.html', permanent: true },
    ];
  },
};

module.exports = nextConfig;
