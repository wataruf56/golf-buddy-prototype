// ゴルフ版MBTI 16タイプの一覧ページ（https://goltomo.com/type）。
// 各タイプ個別ページ /type/[code] のハブ。診断LPへの導線も兼ねる。

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  GOLMOTI_TYPES,
  GOLMOTI_DETAILS,
  GOLMOTI_AXES,
  golmotiImg,
  axisLabels,
} from '@/lib/golmoti';

const SITE = 'https://goltomo.com';
const DIAGNOSIS_URL = '/golmoti.html';

export const metadata: Metadata = {
  title: 'ゴルフ版MBTI 16タイプ一覧｜ゴルフ性格診断 - ゴルトモ',
  description:
    'ゴルフ版MBTI「ゴルトモの16タイプ ゴルフ性格診断」の全タイプ一覧。ぶっ飛ばしエース派から のんびりフェアウェイ散歩派まで、16タイプそれぞれの特徴・強み・弱み・相性を解説します。無料・12問であなたのゴルフ人格をチェック。',
  keywords: [
    'ゴルトモ', 'ゴルフ MBTI', 'ゴルフ 診断', 'ゴルフ性格診断',
    '16タイプ', 'ゴルフタイプ診断', 'ゴル友', 'ゴルフ マッチング',
  ],
  alternates: { canonical: `${SITE}/type` },
  openGraph: {
    type: 'website',
    siteName: 'ゴルトモ',
    url: `${SITE}/type`,
    title: 'ゴルフ版MBTI 16タイプ一覧｜ゴルフ性格診断 - ゴルトモ',
    description:
      'ゴルフ版MBTIの16タイプを一覧で解説。あなたのゴルフ人格はどのタイプ？無料・12問の性格診断でチェックできます。',
    locale: 'ja_JP',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ゴルフ版MBTI 16タイプ一覧｜ゴルトモ',
    description: 'ゴルフ版MBTIの16タイプを一覧で解説。あなたのゴルフ人格はどのタイプ？',
    images: [`${SITE}/ogp-golmoti.png`],
  },
};

export default function TypeIndexPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'ゴルフ版MBTI 16タイプ一覧（ゴルトモ ゴルフ性格診断）',
    description: 'ゴルトモの16タイプ ゴルフ性格診断（ゴルフ版MBTI）で判定される16タイプの一覧。',
    numberOfItems: GOLMOTI_TYPES.length,
    itemListElement: GOLMOTI_TYPES.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${t.name}（${t.code}）`,
      url: `${SITE}/type/${t.code}`,
    })),
  };

  return (
    <main className="min-h-screen bg-bg text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="パンくず" className="max-w-3xl mx-auto px-5 pt-5 text-[12px] font-bold text-sub">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="underline hover:text-green">ゴルトモ</Link></li>
          <li aria-hidden="true">›</li>
          <li className="text-text">ゴルフ版MBTI 16タイプ</li>
        </ol>
      </nav>

      <header className="max-w-3xl mx-auto px-5 pt-4 pb-2 text-center">
        <h1 className="text-2xl sm:text-3xl font-black leading-snug">
          ゴルフ版MBTI<br className="sm:hidden" /> 16タイプ一覧
        </h1>
        <p className="text-[13.5px] font-bold text-sub mt-3 leading-relaxed text-left sm:text-center">
          「ゴルトモの16タイプ ゴルフ性格診断（ゴルフ版MBTI）」で判定される16タイプの一覧です。
          目的・社交・持ち味・向上心の4つの軸の組み合わせで、あなたのゴルフ人格が決まります。
          気になるタイプをタップすると、強み・弱み・あるある・相性のいいタイプまで読めます。
        </p>
      </header>

      {/* 4つの軸 */}
      <section className="max-w-3xl mx-auto px-5 py-4">
        <h2 className="text-lg font-black mb-2">診断の4つの軸</h2>
        <div className="bg-card border-2 border-border rounded-card shadow-card divide-y-2 divide-hair">
          {GOLMOTI_AXES.map((ax) => (
            <div key={ax.key} className="px-4 py-3">
              <div className="text-[11px] font-bold text-sub mb-1">{ax.title}</div>
              <div className="flex items-center justify-between gap-2 text-[14px] font-black">
                <span>{ax.left.emoji} {ax.left.label}<span className="font-mono text-green ml-1">({ax.left.letter})</span></span>
                <span className="text-[11px] font-bold text-muted">vs</span>
                <span><span className="font-mono text-green mr-1">({ax.right.letter})</span>{ax.right.label} {ax.right.emoji}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 16タイプ */}
      <section className="max-w-3xl mx-auto px-5 py-4">
        <h2 className="text-lg font-black mb-3">16タイプの一覧</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GOLMOTI_TYPES.map((t) => {
            const d = GOLMOTI_DETAILS[t.code];
            return (
              <li key={t.code}>
                <Link
                  href={`/type/${t.code}`}
                  className="flex gap-3 items-center bg-card border-2 border-border rounded-card shadow-card p-3.5 h-full hover:bg-green-light transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={golmotiImg(t.code)}
                    alt={`${t.name}（${t.code}）のキャラクター：${t.animal}`}
                    width={72}
                    height={72}
                    className="w-[64px] h-[64px] object-contain shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-extrabold text-green">{t.code}</div>
                    <h3 className="text-[15px] font-black leading-tight">{t.name}</h3>
                    <p className="text-[12px] font-bold text-sub mt-0.5 leading-snug">
                      {d?.tagline}
                    </p>
                    <p className="text-[11px] font-bold text-muted mt-0.5">
                      {axisLabels(t.code).join('・')}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="max-w-3xl mx-auto px-5 py-4 pb-12">
        <div className="bg-green text-white border-2 border-border rounded-card shadow-card p-6 text-center">
          <h2 className="text-xl font-black mb-2">あなたはどのタイプ？</h2>
          <p className="text-[13.5px] font-bold opacity-95 mb-4 leading-relaxed">
            12の質問に答えるだけ。無料のゴルフ性格診断で、あなたのゴルフ人格が16タイプでわかります。
            同じタイプ・相性のいいゴル友とのマッチングもできます。
          </p>
          <a
            href={DIAGNOSIS_URL}
            className="inline-block bg-yellow text-text font-black text-[15px] border-2 border-border rounded-full px-7 py-3 shadow-card"
          >
            無料でゴルフMBTI診断をする →
          </a>
        </div>
      </section>
    </main>
  );
}
