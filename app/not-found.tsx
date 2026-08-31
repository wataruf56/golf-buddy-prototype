import type { Metadata } from 'next';

// 404の見た目。
//
// これまでLPホストは知らないパスを全部LPにしていた（ソフト404）ので、
// 404の画面そのものが無く、Next.js の素の白い画面が出る状態だった。
// 迷い込んだ人がそこで終わらないよう、戻り先を並べておく。
export const metadata: Metadata = {
  title: 'ページが見つかりません｜ゴルトモ',
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: '/', label: 'トップページ', note: 'ゴルトモとは' },
  { href: '/guides', label: 'ゴルフの始め方ガイド', note: '友達探し・一人参加・ラウンド募集' },
  { href: '/golmoti.html', label: 'ゴルフ版MBTI診断', note: '16タイプ・無料' },
  { href: 'https://app.goltomo.com/links/rounds?ref=notfound', label: 'いまの募集を見る', note: '登録なしで中身を見られます' },
];

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', background: '#F4E8CE', color: '#1E3A30',
      fontFamily: "'Zen Maru Gothic','Hiragino Maru Gothic ProN',sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 26 }}>
        <span style={{
          width: 36, height: 36, borderRadius: '50%', background: '#E8643C', color: '#fff',
          border: '2.5px solid #1E3A30', display: 'grid', placeItems: 'center', fontSize: 17,
        }}>⛳</span>
        <span style={{ fontSize: 19, fontWeight: 900 }}>ゴルトモ</span>
      </div>

      <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 19, fontWeight: 900, marginTop: 10 }}>ページが見つかりません</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#5E7A6C', marginTop: 8, lineHeight: 1.9, maxWidth: 320 }}>
        URLが変わったか、募集が終わっている可能性があります。
      </div>

      <div style={{ marginTop: 26, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} style={{
            display: 'block', textDecoration: 'none', color: '#1E3A30', textAlign: 'left',
            background: '#FBF3E0', border: '2.5px solid #1E3A30', borderRadius: 14,
            boxShadow: '3px 3px 0 #1E3A30', padding: '12px 14px',
          }}>
            <span style={{ display: 'block', fontWeight: 900, fontSize: 14 }}>{l.label}</span>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#8a7256', marginTop: 2 }}>{l.note}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
