// ゴルフ版MBTI 16タイプの個別ページ（https://goltomo.com/type/GWPT など）。
//
// 狙い：診断LP(golmoti.html)1枚では拾えないロングテール
// （「ゴルフ 診断 ぶっ飛ばしエース派」「ゴルフ版MBTI GWPT」等）を
// タイプごとの独立URLで取りにいく。診断LPへの導線もここから張る。
//
// 注意：LPホスト(goltomo.com)では middleware が既定で /lp に rewrite するため、
// /type を通すための許可を middleware.ts に入れてある。

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  GOLMOTI_TYPES,
  getGolmotiType,
  getGolmotiDetail,
  golmotiImg,
  polesOf,
  axisLabels,
  matchGood,
  matchOk,
  GOLMOTI_AXES,
} from '@/lib/golmoti';

const SITE = 'https://goltomo.com';
const DIAGNOSIS_URL = '/golmoti.html';
const LINE_URL = 'https://line.me/R/ti/p/@711xiyrs';

function normalize(raw: string): string {
  return decodeURIComponent(raw || '').toUpperCase().trim();
}

export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  const code = normalize(params.code);
  const t = getGolmotiType(code);
  const d = getGolmotiDetail(code);
  if (!t || !d) return { title: 'タイプが見つかりません｜ゴルトモ' };

  const axes = axisLabels(code).join('・');
  const title = `${t.name}（${code}）｜ゴルフ版MBTI 16タイプ性格診断 - ゴルトモ`;
  const description = `${t.name}（${code}／${t.animal}タイプ）は${d.tagline}。${axes}のゴルファー。強み・弱み・あるある・おすすめの回り方まで解説します。あなたのゴルフ人格は？無料のゴルフ性格診断でチェック。`;

  return {
    title,
    description,
    keywords: [
      'ゴルトモ', t.name, code, `ゴルフ ${t.name}`,
      'ゴルフ MBTI', 'ゴルフ 診断', 'ゴルフ性格診断', '16タイプ', 'ゴル友',
    ],
    alternates: { canonical: `${SITE}/type/${code}` },
    openGraph: {
      type: 'article',
      siteName: 'ゴルトモ',
      url: `${SITE}/type/${code}`,
      title: `${t.emoji} ${t.name}（${code}）｜ゴルフ版MBTI 16タイプ`,
      description: `${d.tagline}。${d.desc.slice(0, 80)}`,
      locale: 'ja_JP',
      images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${t.emoji} ${t.name}（${code}）｜ゴルフ版MBTI`,
      description: `${d.tagline}。無料のゴルフ性格診断であなたのタイプをチェック。`,
      images: [`${SITE}/ogp-golmoti.png`],
    },
  };
}

export default function TypePage({ params }: { params: { code: string } }) {
  const code = normalize(params.code);
  const t = getGolmotiType(code);
  const d = getGolmotiDetail(code);
  if (!t || !d) notFound();

  const poles = polesOf(code);
  const goodCode = matchGood(code);
  const okCode = matchOk(code);
  const good = getGolmotiType(goodCode);
  const ok = getGolmotiType(okCode);
  const others = GOLMOTI_TYPES.filter((x) => x.code !== code);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${t.name}（${code}）｜ゴルフ版MBTI 16タイプ性格診断`,
    description: d.desc,
    about: { '@type': 'Thing', name: `ゴルフ版MBTI ${t.name}` },
    image: `${SITE}${golmotiImg(code)}`,
    inLanguage: 'ja',
    isPartOf: {
      '@type': 'WebSite',
      name: 'ゴルトモ',
      url: `${SITE}/`,
    },
    publisher: { '@type': 'Organization', name: '合同会社シクミヤ', url: `${SITE}/` },
    mainEntityOfPage: `${SITE}/type/${code}`,
  };

  const facts: { label: string; value: string }[] = [
    { label: '強み', value: d.strength },
    { label: '弱み', value: d.weakness },
    { label: 'あるある', value: d.aruaru },
    { label: 'おすすめの回り方', value: d.osusume },
    { label: '上達のヒント', value: d.tip },
  ];

  return (
    <main className="min-h-screen bg-bg text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* パンくず（内部リンクの導線も兼ねる） */}
      <nav aria-label="パンくず" className="max-w-2xl mx-auto px-5 pt-5 text-[12px] font-bold text-sub">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="underline hover:text-green">ゴルトモ</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link href="/type" className="underline hover:text-green">ゴルフ版MBTI 16タイプ</Link></li>
          <li aria-hidden="true">›</li>
          <li className="text-text">{t.name}</li>
        </ol>
      </nav>

      {/* ヒーロー */}
      <header className="max-w-2xl mx-auto px-5 pt-4 pb-2">
        <div className="bg-card border-2 border-border rounded-card shadow-card p-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={golmotiImg(code)}
            alt={`${t.name}（${code}）のキャラクター：${t.animal}`}
            width={160}
            height={160}
            className="mx-auto w-[132px] h-[132px] object-contain"
          />
          <div className="font-mono text-[13px] font-extrabold bg-yellow border-2 border-border rounded-full inline-block px-3 py-0.5 mt-1">
            {code}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mt-2 leading-snug">
            {t.emoji} {t.name}
          </h1>
          <p className="text-[13px] font-bold text-sub mt-1">
            ゴルフ版MBTI 16タイプ性格診断 ／ {t.animal}タイプ
          </p>
          <p className="text-[15px] font-bold mt-3">{d.tagline}</p>
        </div>
      </header>

      {/* 4つの軸 */}
      <section className="max-w-2xl mx-auto px-5 py-4">
        <h2 className="text-lg font-black mb-2">{t.name}（{code}）の4つの軸</h2>
        <div className="bg-card border-2 border-border rounded-card shadow-card divide-y-2 divide-hair">
          {GOLMOTI_AXES.map((ax, i) => (
            <div key={ax.key} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl" aria-hidden="true">{poles[i].emoji}</span>
              <div className="flex-1">
                <div className="text-[11px] font-bold text-sub">{ax.title}</div>
                <div className="text-[15px] font-black">
                  {poles[i].label}
                  <span className="font-mono text-green ml-1">({poles[i].letter})</span>
                </div>
              </div>
              <div className="text-[12px] font-bold text-sub text-right max-w-[52%]">
                {poles[i].desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 解説本文 */}
      <section className="max-w-2xl mx-auto px-5 py-2">
        <h2 className="text-lg font-black mb-2">{t.name}（{code}）とは</h2>
        <div className="bg-card border-2 border-border rounded-card shadow-card p-5">
          <p className="text-[14.5px] leading-relaxed">{d.desc}</p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 py-2">
        <h2 className="text-lg font-black mb-2">{t.name}の強み・弱み・あるある</h2>
        <dl className="bg-card border-2 border-border rounded-card shadow-card divide-y-2 divide-hair">
          {facts.map((f) => (
            <div key={f.label} className="px-5 py-3.5">
              <dt className="text-[12px] font-black text-green mb-0.5">{f.label}</dt>
              <dd className="text-[14px] leading-relaxed">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 相性 */}
      <section className="max-w-2xl mx-auto px-5 py-4">
        <h2 className="text-lg font-black mb-2">{t.name}と相性のいいゴルフタイプ</h2>
        <p className="text-[13px] font-bold text-sub mb-3">
          社交の軸を補い合うタイプが◎、飛距離派×技巧派で持ち味を補い合うタイプが○です。
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { mark: '◎', label: 'ものすごく相性がいい', c: goodCode, t: good },
            { mark: '○', label: '相性がいい', c: okCode, t: ok },
          ].map((m) =>
            m.t ? (
              <Link
                key={m.c}
                href={`/type/${m.c}`}
                className="bg-card border-2 border-border rounded-card shadow-card p-4 text-center hover:bg-green-light transition-colors"
              >
                <div className="text-[12px] font-black text-orange">{m.mark} {m.label}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={golmotiImg(m.c)}
                  alt={`${m.t.name}（${m.c}）`}
                  width={80}
                  height={80}
                  className="mx-auto w-[72px] h-[72px] object-contain my-1"
                />
                <div className="text-[14px] font-black leading-tight">{m.t.name}</div>
                <div className="font-mono text-[12px] font-bold text-sub">{m.c}</div>
              </Link>
            ) : null
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-5 py-4">
        <div className="bg-green text-white border-2 border-border rounded-card shadow-card p-6 text-center">
          <h2 className="text-xl font-black mb-2">あなたのゴルフ人格は？</h2>
          <p className="text-[13.5px] font-bold opacity-95 mb-4 leading-relaxed">
            12の質問に答えるだけ。ゴルトモの16タイプ・ゴルフ性格診断（ゴルフ版MBTI）で、
            あなたが{t.name}かどうかを無料でチェックできます。
          </p>
          <a
            href={DIAGNOSIS_URL}
            className="inline-block bg-yellow text-text font-black text-[15px] border-2 border-border rounded-full px-7 py-3 shadow-card"
          >
            無料でゴルフMBTI診断をする →
          </a>
          <p className="text-[12px] font-bold opacity-90 mt-4">
            同じタイプ・相性のいいゴル友とラウンドを回るなら
          </p>
          <a href={LINE_URL} className="inline-block underline font-black text-[14px] mt-1">
            LINEでゴルトモを friends に追加する
          </a>
        </div>
      </section>

      {/* 他のタイプ（内部リンクのハブ） */}
      <section className="max-w-2xl mx-auto px-5 py-4 pb-12">
        <h2 className="text-lg font-black mb-2">ゴルフ版MBTI 他の15タイプ</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {others.map((o) => (
            <li key={o.code}>
              <Link
                href={`/type/${o.code}`}
                className="flex items-center gap-2 bg-card border-2 border-border rounded-card px-3 py-2.5 hover:bg-green-light transition-colors h-full"
              >
                <span className="text-lg" aria-hidden="true">{o.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-black leading-tight">{o.name}</span>
                  <span className="block font-mono text-[11px] font-bold text-sub">{o.code}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-center mt-5">
          <Link href="/type" className="text-[13px] font-black underline hover:text-green">
            ← ゴルフ版MBTI 16タイプ一覧に戻る
          </Link>
        </p>
      </section>
    </main>
  );
}
