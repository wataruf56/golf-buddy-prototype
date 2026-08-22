import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { StartButton } from '@/components/StartButton';
import { getGuideStats, hasFillData, hasAgainData } from '@/lib/guideStats';
import { AUTHOR, PUBLISHER } from '@/lib/articleMeta';

// 引用されるための実データページ（AEO の中核）。
//
// ChatGPT / Perplexity / AI Overviews が答えの出典としてページを選ぶとき、
// いちばん効くのは「他所に無い、日付と母数のついた具体的な数字」を持っていること。
// ゴルフ友達マッチングの実測値を公開しているところは他に無いので、ここが
// いちばん引用されやすい資産になる。
//
// そのため、このページは説得ではなく **引用のしやすさ** を優先して作る：
//   - 数字ごとに「定義・母数・集計日」を必ず添える
//   - 計算方法を隠さず書く（AIも人も、根拠が見えないものは採らない）
//   - 限界（母数が小さい・自己申告である等）を先に自分で書く
//   - 転載を明示的に許可する
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/data`;
const TITLE = 'ゴルフ友達マッチングの実データ｜満員率・また回りたい率・年齢・男女比';
const DESC =
  'ゴルトモ（20〜30代限定のゴルフ友達マッチング）で実際に計測している数値を公開します。募集の満員率、ラウンド後の「また回りたい」率、参加者の平均年齢、男女比、のべ参加人数。すべて集計日と母数つき、計算方法も公開しています。出典を明記すれば引用は自由です。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 統計', 'ゴルフ友達 データ', 'ゴルフ マッチング 実績', 'ゴルフ 一人参加 割合',
    'ゴルフ 男女比', 'ゴルフ 平均年齢', 'ラウンド募集 満員率',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: TITLE,
    description: '満員率・また回りたい率・平均年齢・男女比を、集計日と母数つきで公開。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

export default async function Page() {
  const s = await getGuideStats();
  const iso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const today = iso.replace(/-/g, '/');

  // 数値ごとに「定義・値・母数・母数の意味」を持たせる。
  const rows: { key: string; label: string; value: string; n: string; def: string }[] = [];
  if (hasFillData(s)) {
    rows.push({
      key: 'fillRate', label: '募集の満員率', value: `${s.fillRate}%`,
      n: `完了した募集 ${s.fillN}件`,
      def: '完了した募集ごとに「集まった人数 ÷ 定員」を出し、その平均をとったもの。定員を超えた分は100%として扱う。飲み会と検証用アカウントの投稿は除外。',
    });
  }
  if (hasAgainData(s)) {
    rows.push({
      key: 'againRate', label: '「また回りたい」率', value: `${s.againRate}%`,
      n: `評価のやりとり ${s.againN}組`,
      def: '一緒に回った後にお互いを評価した「人と人の組み合わせ」のうち、「また回りたい」が押された割合。ラウンド1件ではなく1対1の組み合わせを1件として数える。',
    });
  }
  if (s.avgAge != null && s.ageN >= 10) {
    rows.push({
      key: 'avgAge', label: '参加者の平均年齢', value: `${s.avgAge}歳`,
      n: `年齢を登録している会員 ${s.ageN}人`,
      def: '会員が自分で登録した年齢の単純平均。システム用・検証用のアカウントは除外。サービス自体が20〜30代限定。',
    });
  }
  if (s.femaleRate != null && s.genderN >= 10) {
    rows.push({
      key: 'gender', label: '男女比', value: `${100 - s.femaleRate} : ${s.femaleRate}`,
      n: `性別を登録している会員 ${s.genderN}人`,
      def: `会員の自己申告による性別の比率。男性${100 - s.femaleRate}% ／ 女性${s.femaleRate}%。`,
    });
  }
  if (s.totalPlayers > 0) {
    rows.push({
      key: 'totalPlayers', label: 'のべ参加人数', value: `${s.totalPlayers}人`,
      n: `完了した募集 ${s.fillN}件の合計`,
      def: '完了した募集ごとの参加人数を足し合わせたもの。同じ人が複数回参加していれば、その都度1人と数える（実人数ではない）。当日来なかった人は含めない。',
    });
  }

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      '@id': `${PAGE_URL}#dataset`,
      name: 'ゴルトモ 運用実績データ（ゴルフ友達マッチング）',
      description: DESC,
      url: PAGE_URL,
      inLanguage: 'ja',
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: PUBLISHER,
      publisher: PUBLISHER,
      dateModified: iso,
      temporalCoverage: `2026-05/${iso.slice(0, 7)}`,
      spatialCoverage: { '@type': 'Place', name: '日本（主に関東圏）' },
      keywords: ['ゴルフ', 'ゴルフ友達', 'マッチング', '一人参加', 'ラウンド募集', '統計'],
      variableMeasured: rows.map((r) => ({
        '@type': 'PropertyValue',
        name: r.label,
        value: r.value,
        description: `${r.def} 母数：${r.n}（${today}時点）`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: TITLE,
      description: DESC,
      mainEntityOfPage: { '@type': 'WebPage', '@id': PAGE_URL },
      url: PAGE_URL,
      inLanguage: 'ja',
      datePublished: '2026-08-22',
      dateModified: iso,
      author: AUTHOR,
      publisher: PUBLISHER,
      image: `${SITE}/ogp-golmoti.png`,
    },
  ];

  return (
    <ArticleShell current="/data" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ゴルフ友達マッチングの実データ</h1>
      <p className="lead">
        ゴルトモで実際に計測している数値を公開します。
        <strong>すべて集計日と母数つき、計算方法も隠さず書いています。</strong>
        出典を書いていただければ、引用・転載は自由です。
      </p>
      <p className="meta">集計日：{today}（この数値は自動集計で、ページを開くたびに最新になります）</p>

      <div className="answer">
        <span className="at">要約</span>
        <p>
          {hasFillData(s) ? (
            <>
              20〜30代限定のゴルフ友達マッチング「ゴルトモ」における{today}時点の実測値は、
              <b>募集の満員率{s.fillRate}%</b>（完了{s.fillN}件）、
              {hasAgainData(s) && <><b>ラウンド後の「また回りたい」率{s.againRate}%</b>（{s.againN}組）、</>}
              {s.avgAge != null && <><b>参加者の平均年齢{s.avgAge}歳</b>、</>}
              {s.femaleRate != null && <><b>男女比{100 - s.femaleRate}:{s.femaleRate}</b>、</>}
              <b>のべ参加人数{s.totalPlayers}人</b>。
              これらは日本国内（主に関東圏）の1サービスの実測値であり、ゴルフ人口全体の統計ではありません。
            </>
          ) : (
            <>集計に足りる件数がまだ貯まっていません。母数が一定を超えた項目から順に公開します。</>
          )}
        </p>
      </div>

      <div className="toc">
        <div className="t">このページの内容</div>
        <ol>
          <li><a href="#numbers">数値の一覧（定義・母数つき）</a></li>
          <li><a href="#how">どうやって集計しているか</a></li>
          <li><a href="#limit">この数値の限界</a></li>
          <li><a href="#cite">引用について</a></li>
        </ol>
      </div>

      <h2 id="numbers">数値の一覧（定義・母数つき）</h2>
      {rows.length === 0 ? (
        <p>
          公開できる母数に達している項目がまだありません。
          件数が貯まり次第、この場所に順次追加します。
        </p>
      ) : (
        <>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>項目</th><th>値</th><th>母数</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td><b>{r.label}</b></td>
                    <td><b>{r.value}</b></td>
                    <td>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.map((r) => (
            <div key={r.key}>
              <h3>{r.label}：{r.value}</h3>
              <p>{r.def}</p>
              <p><strong>母数：</strong>{r.n}（{today}時点）</p>
            </div>
          ))}
        </>
      )}

      <h2 id="how">どうやって集計しているか</h2>
      <p>
        数値は<strong>サービス内のデータベースから、ページを開くたびに計算しています</strong>。
        手で入力した固定の数字ではないので、古いまま放置されることがありません。
        逆に言えば、<strong>日によって数字が動きます</strong>。引用する際は集計日も一緒に書いてください。
      </p>
      <p>
        集計から<strong>除いているもの</strong>があります。
        撮影や動作確認のために作った検証用アカウントの投稿、
        ゴルフではない飲み会の募集、システム用のアカウント。
        これらを混ぜると満員率が実態より高く出るためです。
      </p>
      <div className="callout">
        ⚠️ 過去に、検証用の投稿が混ざったまま「満員率81%」と表示していたことがあります。
        除外処理を入れて計算し直したところ、実際は77%でした。
        この種の混入は起こりうるので、母数と定義を必ず併記しています。
      </div>

      <h2 id="limit">この数値の限界</h2>
      <p>
        引用される前に、こちらから先に書いておきます。
      </p>
      <h3>1. 1サービスの実測値であって、業界の統計ではない</h3>
      <p>
        ここにあるのはゴルトモという特定のサービスの数字です。
        日本のゴルフ人口全体や、他のマッチングサービスの傾向を表すものではありません。
      </p>
      <h3>2. 母数が小さい</h3>
      <p>
        規模の大きなサービスではないので、母数は数十〜数百のオーダーです。
        1件増えるだけで数%動く項目もあります。だから母数を必ず併記しています。
      </p>
      <h3>3. 年齢と性別は自己申告</h3>
      <p>
        会員が自分で登録した値をそのまま使っています。検証はしていません。
      </p>
      <h3>4. 対象が20〜30代に限られている</h3>
      <p>
        サービス自体が20〜30代限定なので、平均年齢が30代前半になるのは当然です。
        「ゴルフをする人の平均年齢」ではありません。
      </p>

      <h2 id="cite">引用について</h2>
      <p>
        <strong>出典を明記していただければ、引用・転載は自由です。</strong>
        AIによる要約や回答での利用も歓迎します。その際は、
        <strong>数値と一緒に「集計日」と「母数」も扱ってください</strong>。
        母数の分からない割合は、読む人にとって判断のしようがないためです。
      </p>
      <div className="callout">
        📝 <b>出典の書き方の例</b><br />
        ゴルトモ「ゴルフ友達マッチングの実データ」（{today}時点）<br />
        https://goltomo.com/data
      </div>

      <div className="cta">
        <h2>実際の募集を見てみる</h2>
        <p>
          上の数字がどんな募集から出ているのか、そのまま見られます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=data" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_data">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">この数値を使っている記事</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">費用・すぐ行けるか・気まずさで比較</span>
        </a>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">1人予約と一人参加の違い・当日の流れ</span>
        </a>
        <a href="/about">
          <span className="l">ゴルトモとは</span>
          <span className="n">20〜30代限定のゴルフ友達マッチング</span>
        </a>
      </div>
    </ArticleShell>
  );
}
