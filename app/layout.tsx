import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

// Force dynamic rendering for every route. Without this, Next statically
// prerenders pages and serves the HTML with `Cache-Control: s-maxage=31536000`
// (1 year). Firebase Hosting's CDN then keeps serving the OLD HTML — which
// references the OLD hashed JS chunks — long after a new deploy, so fixes never
// reached devices (especially the LINE LIFF in-app webview). Dynamic rendering
// emits `no-store`, so each load fetches fresh HTML pointing at the current
// build's chunks. The immutable /_next/static chunks stay CDN-cached, so the
// cost is just re-fetching the small HTML document.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ゴルトモ - ゴル友マッチング × AIスイング解析',
  description: 'ゴル友マッチングとAIスイング解析が一つになったLINEアプリ。同年代のゴルファーと一緒にラウンドを回ろう。',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ゴルトモ' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2A8C82',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=Baloo+2:wght@600;700;800&family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
