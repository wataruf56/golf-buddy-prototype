import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { SITE, AUTHOR, PUBLISHER } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 記事の一覧ハブ。
//
// 置き場所が /guide ではなく /guides なのは、`/guide` を**アプリの「使い方」ページ**
// (app/(main)/guide) が先に使っているため。同じパスに2つは置けない。
// メモにあった「/guide がソフト404」の正体もこれで、記事の親URLを開くと
// アプリの共通シェルが200で返っていた。
// 記事側の BreadcrumbList も第2階層をここに向け直す。
//
// 一覧を置くことで、
//   ・パンくずの指す先が実在する
//   ・トップLPから各記事への内部リンクが1階層で集約される
//   ・「ゴルフ 初心者」など、個別記事より広い語の受け皿になる
export const dynamic = 'force-dynamic';

const PAGE_URL = `${SITE}/guides`;
const TITLE = 'ゴルフの始め方ガイド｜友達探し・一人参加・ラウンド募集';
const DESC =
  'ゴルフ友達の探し方、一人でのラウンド参加、20代・30代の始め方、ラウンド募集の書き方まで。20〜30代限定のゴルフ友達マッチング「ゴルトモ」の運用データをもとにまとめた記事の一覧です。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 始め方', 'ゴルフ友達 探し', 'ゴルフ 一人参加', 'ラウンド募集',
    'ゴルフ 20代', 'ゴルフ 30代', 'ゴルフ 初心者', 'ゴル友',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルフの始め方ガイド｜ゴルトモ',
    description: '友達探し・一人参加・ラウンド募集・20代/30代の始め方。運用データつきの記事一覧。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

// 並び順は「詰まる順」。まず一緒に回る人、次に一人で行けるか、次に当日、と進む。
const ARTICLES = [
  {
    href: '/guide/find-golf-friends',
    title: 'ゴルフ友達の探し方7つ',
    lead: 'ゴルフ友達探しの方法を、費用・すぐ行けるか・気まずさで比較しました。職場のつてからマッチングまで7つ。',
    tag: '友達探し',
  },
  {
    href: '/guide/golf-matching',
    title: 'ゴルフマッチングとは',
    lead: 'サービスを選ぶ4つの軸（目的・年代・費用・アプリの要否）。ゴルトモが向かない人も書いています。',
    tag: 'マッチング',
  },
  {
    href: '/guide/solo-round',
    title: '一人でゴルフに行くには',
    lead: '一人参加は実際どうなるのか。申し込みから当日の流れ、気まずくならないための準備まで。',
    tag: '一人参加',
  },
  {
    href: '/guide/round-recruit',
    title: 'ゴルフのラウンド募集',
    lead: '人が集まる募集の5つの条件と、そのまま使える書き方。参加する側の見極め方も。',
    tag: 'ラウンド募集',
  },
  {
    href: '/guide/golf-20s',
    title: '20代のゴルフの始め方',
    lead: '費用・道具の揃え方と、20代が一番詰まる「一緒に回る人」の作り方。',
    tag: '20代',
  },
  {
    href: '/guide/golf-30s',
    title: '30代からのゴルフ',
    lead: '仕事の付き合いで必要になった人と、趣味で始める人へ。接待の前に済ませておくこと。',
    tag: '30代',
  },
  {
    href: '/guide/round-debut',
    title: 'ラウンドデビューの進め方',
    lead: '初めてコースに出る人へ。持ち物、当日の流れ、最初のホールで慌てないために。',
    tag: '初心者',
  },
  {
    href: '/guide/golf-without-car',
    title: '車がなくてもゴルフに行く',
    lead: '送迎（ピックアップ）・相乗り・送迎バスの使い分け。駅からの行き方を具体的に。',
    tag: '車なし',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  // 一覧なので Article ではなく CollectionPage + ItemList。
  // パンくずは記事側と同じ階層に揃える。
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: TITLE,
      description: DESC,
      url: PAGE_URL,
      inLanguage: 'ja',
      author: AUTHOR,
      publisher: PUBLISHER,
      isAccessibleForFree: true,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: ARTICLES.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: a.title,
          url: `${SITE}${a.href}`,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'ガイド', item: PAGE_URL },
      ],
    },
  ];

  return (
    <ArticleShell current="/guides" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="パンくず" className="meta">
        <a href="/">ホーム</a> ／ ガイド
      </nav>

      <h1>ゴルフの始め方ガイド</h1>
      <p className="lead">
        「一緒に回る人がいない」「一人で申し込んで大丈夫なのか」「募集を出しても集まらない」。
        ゴルフを始めてから実際に詰まるところを、
        <strong>20〜30代限定で運用しているゴルトモの実データ</strong>をもとにまとめています。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">はじめての方へ</span>
        <p>
          道具や練習法より先に読むべきなのは、<b>一緒に回る人をどう見つけるか</b>です。
          ゴルフは4人1組で回るため、一人では始められません。
          まずは<b><a href="/guide/find-golf-friends">ゴルフ友達の探し方7つ</a></b>から読んでください。
        </p>
      </div>

      <h2>記事一覧</h2>
      <div className="rel">
        {ARTICLES.map((a) => (
          <a key={a.href} href={a.href}>
            <span className="l">{a.title}</span>
            <span className="n">{a.lead}</span>
          </a>
        ))}
      </div>

      <h2>ゴルフ版MBTI診断</h2>
      <div className="rel">
        <a href="/golmoti.html">
          <span className="l">ゴルフ版MBTI・16タイプ診断</span>
          <span className="n">自分がどんなゴルファーか、16タイプで分かります（無料）</span>
        </a>
        <a href="/type">
          <span className="l">16タイプ一覧</span>
          <span className="n">タイプごとの特徴と、相性のいいタイプ</span>
        </a>
      </div>

      <h2>ゴルトモについて</h2>
      <div className="rel">
        <a href="/about">
          <span className="l">ゴルトモとは</span>
          <span className="n">20〜30代限定のゴルフ友達マッチング。LINEだけで使えて無料</span>
        </a>
        <a href="/data">
          <span className="l">実データを見る</span>
          <span className="n">満員率・また回りたい率・年齢・男女比</span>
        </a>
      </div>

      <div className="cta">
        <h2>一緒に回る人を探す</h2>
        <p>
          20〜30代限定。一人で参加して、また回りたい人を見つけられます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_hub" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_hub">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>
    </ArticleShell>
  );
}
