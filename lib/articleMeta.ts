// 記事の構造化データを1か所で組み立てる。
//
// 【なぜ必要か】
// AI（ChatGPT・Perplexity・Google AI Overviews など）が答えの出典としてページを
// 選ぶとき、「いつの情報か」「誰が書いたか」「何件のデータに基づくか」を強く見る。
// これまで Article に datePublished / dateModified / author(Person) が入っておらず、
// 日付不明の記事として扱われていた。ここで揃える。
//
// dateModified は自動で「今日」にしない。中身を直していないのに更新日だけ動くと、
// 実態と合わない上に信用を落とすため、記事を書き換えたときに手で上げる。

export const SITE = 'https://goltomo.com';
export const INSTAGRAM_URL = 'https://www.instagram.com/goltomo.golf/';

// 書き手。E-E-A-T（誰が書いたか）のために Person として出す。
export const AUTHOR = {
  '@type': 'Person' as const,
  name: '福田 航',
  jobTitle: 'ゴルトモ 運営',
  worksFor: { '@type': 'Organization', name: '合同会社シクミヤ', url: 'https://shikumi-ya.com/' },
};

export const PUBLISHER = {
  '@type': 'Organization' as const,
  name: 'ゴルトモ',
  url: `${SITE}/`,
  sameAs: [INSTAGRAM_URL, 'https://shikumi-ya.com/'],
  parentOrganization: { '@type': 'Organization', name: '合同会社シクミヤ', url: 'https://shikumi-ya.com/' },
};

export type ArticleMeta = {
  path: string;          // '/guide/solo-round'
  title: string;
  description: string;
  published: string;     // 'YYYY-MM-DD'
  modified: string;      // 中身を直したら上げる
};

export function articleJsonLd(m: ArticleMeta, faq: { q: string; a: string }[]) {
  const url = `${SITE}${m.path}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: m.title,
      description: m.description,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      url,
      inLanguage: 'ja',
      datePublished: m.published,
      dateModified: m.modified,
      author: AUTHOR,
      publisher: PUBLISHER,
      image: `${SITE}/ogp-golmoti.png`,
      isAccessibleForFree: true,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'ガイド', item: `${SITE}/guides` },
        { '@type': 'ListItem', position: 3, name: m.title, item: url },
      ],
    },
  ];
}
