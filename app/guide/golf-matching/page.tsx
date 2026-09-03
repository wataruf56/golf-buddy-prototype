import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフマッチング」「ゴルフマッチングアプリ」で戦うための受け皿。
//
// 【この語の検索意図】
// 実際の検索結果を見ると、上位はほぼ次の3種類だった。
//   (a) アプリストアのページ  (b) 専用アプリの公式サイト  (c) 比較メディアの「おすすめ◯選」
// つまり検索している人は「**どのサービスを使うか決めたい**」であって、
// 「マッチングとは何か」を知りたいわけではない。だから比較の形で書く。
//
// 【正直に書く方針】
// 他社の料金や会員数は、こちらで確かめられない数字なので**書かない**。
// 間違ったことを書くと、それだけで信用を失ううえ、直す手間も残る。
// 代わりに「選ぶときの軸」を出して、その軸のうえで自社がどこにいるかを示す。
// ゴルトモが向かない人（40代以上・恋愛目的・アプリで完結したい人）も明記する。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/golf-matching`;
const TITLE = 'ゴルフマッチングとは｜アプリの選び方と、一緒に回る人の見つけ方';
const DESC =
  'ゴルフマッチングのサービスを選ぶときの4つの軸（目的・年代・費用・アプリが要るか）を整理しました。恋愛目的とゴルフ仲間目的で選ぶべきものは変わります。20〜30代でLINEだけで使えるゴルトモの位置づけも、向かない人まで正直に書いています。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフマッチング', 'ゴルフ マッチング', 'ゴルフマッチングアプリ',
    'ゴルフ アプリ 仲間', 'ゴルフ仲間 アプリ', 'ゴル友', 'ゴルフ友達探し',
    'ゴルフ 一人参加',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルフマッチングとは｜アプリの選び方',
    description: '目的・年代・費用・アプリの要否。4つの軸で選び方を整理しました。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

// 選ぶときの軸。他社の個別の数字は確かめられないので書かない。
const AXES = [
  {
    n: '① 目的（ゴルフ仲間か、恋愛か）',
    body: 'ここを間違えると全部ずれます。「ゴルフマッチング」と名乗るサービスには、'
      + '**一緒に回る人を探すもの**と、**ゴルフを共通の趣味にした出会い系**の2種類があります。'
      + '見分け方は簡単で、男女比や「異性とマッチング」を前面に出しているものは後者です。',
  },
  {
    n: '② 年代',
    body: 'ゴルフは時間とお金に余裕のある年代に偏るため、多くのサービスは30〜50代が中心です。'
      + '20代が申し込むと、同伴者が親世代になることがあります。'
      + '**年代で絞れるか**を必ず確認してください。腕前より、予算感とペースが揃うかのほうが効きます。',
  },
  {
    n: '③ 費用',
    body: '月額のかかるものと、無料のものがあります。'
      + 'ラウンド代（1回7,000〜15,000円）は別途かかるので、'
      + '**月額 ＋ ラウンド代**で考えないと、思ったより高くつきます。',
  },
  {
    n: '④ アプリを入れる必要があるか',
    body: 'アプリストアからダウンロードするものが大半です。'
      + '通知のためにアプリを常駐させたくない人や、まず試したいだけの人には負担になります。'
      + 'LINEの中だけで完結するものもあります。',
  },
];

const CHECKS = [
  { n: '相手の実績が見えるか', note: 'ラウンド後の評価が残るか。残らない場では、当日まで相手がどんな人か分かりません。' },
  { n: '一人で申し込めるか', note: '2人1組が前提のサービスもあります。一人で行きたいなら必ず確認してください。' },
  { n: '車がなくても行けるか', note: 'ゴルフ場は駅から遠いのが普通です。送迎や相乗りの仕組みがあるかで、行ける範囲が変わります。' },
  { n: '初心者でも入れるか', note: 'スコアの下限があるサービスもあります。「ラウンド未経験」から選べるかを見てください。' },
  { n: 'やめるのが簡単か', note: '合わなかったときに抜けやすいか。退会や解約の導線が分かりにくいものは避けたほうが無難です。' },
];

const FAQ = [
  {
    q: 'ゴルフマッチングとは何ですか？',
    a: 'ゴルフを一緒に回る相手を見つける仕組みのことです。ゴルフは4人1組で回るため、人数を揃えるのが最大の手間になります。その工程を代わりに引き受けるのがゴルフマッチングです。恋愛目的のものと、ゴルフ仲間探しのものがあります。',
  },
  {
    q: 'ゴルフマッチングアプリは無料で使えますか？',
    a: '無料のものと月額のものがあります。いずれの場合もラウンド代（1回7,000〜15,000円）は別途かかります。ゴルトモは利用無料で、アプリのダウンロードも不要です。',
  },
  {
    q: '一人で申し込んでも大丈夫ですか？',
    a: '大丈夫です。ゴルトモの募集は一人での参加が前提で、参加者の多くが単独で申し込んでいます。ラウンド後の相互レビューがあるため、初対面でも荒れにくい仕組みになっています。',
  },
  {
    q: '20代でも使えるゴルフマッチングはありますか？',
    a: 'あります。多くのサービスは30〜50代が中心ですが、ゴルトモは20〜30代限定で運用しているため、同世代とだけ回れます。',
  },
  {
    q: '恋愛目的ではないサービスを探しています。',
    a: '「異性とマッチング」を前面に出しているかどうかで見分けられます。ゴルトモは同性同士のマッチングも成立する設計で、一緒に回る相手を見つけることを目的にしています。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const showFill = s.fillRate != null && s.fillN >= 3;
  const showAge = s.avgAge != null && s.ageN >= 20;
  const showAgain = s.againRate != null && s.againN >= 20;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = articleJsonLd(
    { path: '/guide/golf-matching', title: TITLE, description: DESC, published: '2026-09-03', modified: '2026-09-03' },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/golf-matching" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ゴルフマッチングとは<br />アプリの選び方と、一緒に回る人の見つけ方</h1>
      <p className="lead">
        「ゴルフマッチング」と名乗るサービスは、大きく<strong>2種類</strong>あります。
        一緒に回る人を探すものと、ゴルフを共通の趣味にした出会い系です。
        ここを取り違えると、登録してから「思っていたのと違う」になります。
        選ぶときの軸を先に整理します。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>選ぶ軸は4つです。</b>①目的（ゴルフ仲間か恋愛か）②年代 ③費用 ④アプリが要るか。
          とくに<b>年代で絞れるか</b>は効きます。ゴルフは時間とお金に余裕のある年代に偏るため、
          多くのサービスは30〜50代が中心で、<b>20代が申し込むと同伴者が親世代になることがあります。</b>
          腕前より、予算感とペースが揃うかのほうが、また回りたいかを左右します。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#what">ゴルフマッチングとは</a></li>
          <li><a href="#axes">選ぶときの4つの軸</a></li>
          <li><a href="#check">申し込む前に見るところ</a></li>
          <li><a href="#goltomo">ゴルトモの位置づけ（向かない人も書きます）</a></li>
          <li><a href="#data">実際どれくらい成立しているか</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="what">ゴルフマッチングとは</h2>
      <p>
        ゴルフを一緒に回る相手を見つける仕組みのことです。
        ゴルフは<strong>4人1組</strong>で回るため、人数を揃えるのが最大の手間になります。
        3人までは集まったのに、あと1人が埋まらない。この工程を代わりに引き受けるのがゴルフマッチングです。
      </p>
      <p>
        <strong>一人では始められない</strong>のがゴルフの性質で、他の趣味と決定的に違うところです。
        道具を揃えて練習場に通っても、コースに出られないまま止まる人が多いのはこれが理由です。
      </p>

      <h2 id="axes">選ぶときの4つの軸</h2>
      {AXES.map((a) => (
        <div key={a.n}>
          <h3>{a.n}</h3>
          <p dangerouslySetInnerHTML={{ __html: a.body.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      ))}
      <div className="callout">
        個別のサービスの料金や会員数は、時期によって変わるうえ、こちらで確かめられません。
        <strong>この記事では書かないことにしています。</strong>
        気になるサービスがあれば、公式ページで最新の条件を確認してください。
      </div>

      <h2 id="check">申し込む前に見るところ</h2>
      <div className="tbl">
        <table>
          <thead><tr><th>確認すること</th><th>なぜ効くのか</th></tr></thead>
          <tbody>
            {CHECKS.map((c) => (
              <tr key={c.n}><td><b>{c.n}</b></td><td>{c.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="goltomo">ゴルトモの位置づけ</h2>
      <p>
        この記事を書いているゴルトモも、ゴルフマッチングのサービスです。
        4つの軸でいうとこうなります。
      </p>
      <div className="tbl">
        <table>
          <thead><tr><th>軸</th><th>ゴルトモ</th></tr></thead>
          <tbody>
            <tr><td>目的</td><td><b>ゴルフ仲間</b>（同性同士のマッチングも成立します）</td></tr>
            <tr><td>年代</td><td><b>20〜30代限定</b>。それ以外は入れません</td></tr>
            <tr><td>費用</td><td><b>無料</b>（ラウンド代は別途）</td></tr>
            <tr><td>アプリ</td><td><b>不要</b>。LINEの中だけで完結します</td></tr>
          </tbody>
        </table>
      </div>
      <h3>向かない人</h3>
      <p>
        正直に書いておきます。次に当てはまる方は、別のサービスのほうが合います。
      </p>
      <p>
        <strong>・40代以上の方</strong>……年齢で入れません。同世代と回れる場を選んでください。<br />
        <strong>・恋愛が目的の方</strong>……一緒に回る相手を見つける設計で、出会い系ではありません。<br />
        <strong>・アプリで完結したい方</strong>……LINEの中で動くので、独立したアプリはありません。<br />
        <strong>・すぐ今週末に回りたい方</strong>……募集が集まるまで数日かかります。急ぐならゴルフ場の1人予約が確実です。
      </p>

      <h2 id="data">実際どれくらい成立しているか</h2>
      <p>
        比較記事では数字が出てこないことが多いので、運用している実数を出します。
        母数が少ない項目は載せていません。
      </p>
      {(showFill || showAge || showAgain) ? (
        <div className="data">
          <div className="dt">⛳ ゴルトモの実績（{today} 時点）</div>
          <div className="dg">
            {showFill && (
              <div className="dc"><div className="dv">{s.fillRate}%</div>
                <div className="dl">募集が満員になった割合</div><div className="dn">n={s.fillN}件</div></div>
            )}
            {showAgain && (
              <div className="dc"><div className="dv">{s.againRate}%</div>
                <div className="dl">また回りたいと答えた割合</div><div className="dn">n={s.againN}件</div></div>
            )}
            {showAge && (
              <div className="dc"><div className="dv">{s.avgAge}歳</div>
                <div className="dl">参加者の平均年齢</div><div className="dn">n={s.ageN}人</div></div>
            )}
            {s.totalPlayers > 0 && (
              <div className="dc"><div className="dv">{s.totalPlayers}人</div>
                <div className="dl">のべ参加人数</div><div className="dn">同じ人の重複を含む</div></div>
            )}
          </div>
          <div className="note">
            ※ ページを開くたびに集計し直しています。動作確認用のアカウントは除いています。
          </div>
        </div>
      ) : (
        <p>現在集計中です。母数が少ないうちは、実態とかけ離れた数字が出るため公開していません。</p>
      )}

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>20〜30代で、一緒に回る人を探す</h2>
        <p>
          アプリのダウンロードは不要。LINEだけで、約30秒で始められます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_matching" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_matching">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達探しの方法7つ</span>
          <span className="n">マッチング以外の6つの方法と比べる</span>
        </a>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">一人参加の実際と、当日の流れ</span>
        </a>
        <a href="/guide/round-recruit">
          <span className="l">ゴルフのラウンド募集</span>
          <span className="n">集まる募集の書き方と選び方</span>
        </a>
        <a href="/guide/golf-without-car">
          <span className="l">車がなくてもゴルフに行く</span>
          <span className="n">送迎・相乗りの使い方</span>
        </a>
      </div>
    </ArticleShell>
  );
}
