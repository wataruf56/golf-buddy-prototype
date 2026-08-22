import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats, hasFillData, hasAgainData } from '@/lib/guideStats';

// 「ラウンドデビュー」「ゴルフ 初心者 コースデビュー」狙いの記事。
//
// この語で検索する人が本当に困っているのは「いつ行っていいのか」の判断基準と、
// 「誰と行くか」。前者は数字（練習場での目安）で、後者は同伴者の選び方で答える。
// 費用の内訳を実額で出しているページが少ないので、そこも埋める。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/round-debut`;
const TITLE = 'ラウンドデビューの進め方｜いつ行くか・誰と行くか・いくらかかるか';
const DESC =
  'ゴルフのラウンドデビューを、いつ行くか（練習場での目安）・誰と行くか・いくらかかるか・何を持っていくかの4点に分けて解説します。初心者が最初のコースで実際につまずく場面と、その回避方法もまとめました。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ラウンドデビュー', 'ゴルフ コースデビュー', 'ゴルフ 初心者 コース', 'ゴルフ デビュー 準備',
    'ラウンドデビュー 練習', 'ゴルフ 初ラウンド 費用', 'ゴルフ 初心者 持ち物',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ラウンドデビューの進め方｜いつ行くか・誰と行くか・いくらかかるか',
    description: '練習場での目安、同伴者の選び方、費用の内訳、持ち物を具体的にまとめました。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

const COST = [
  { n: 'プレー費（平日）', v: '6,000〜10,000円', note: '昼食付きのことが多い。都心から近いほど高い' },
  { n: 'プレー費（土日）', v: '10,000〜18,000円', note: '同じコースでも平日の1.5〜2倍になる' },
  { n: '交通費', v: '0〜3,000円', note: '高速代・ガソリン代。相乗りなら割り勘' },
  { n: 'レンタルクラブ', v: '2,000〜4,000円', note: '持っていれば0円。最初は借りてもいい' },
  { n: 'ボール', v: '1,000〜2,000円', note: '初回は1ダース持っていく。必ず無くす' },
  { n: '練習場（前日まで）', v: '1,000〜2,000円／回', note: 'デビューまでに5〜10回は行きたい' },
];

const FAQ = [
  {
    q: 'ラウンドデビューはどれくらい練習してから行くべきですか？',
    a: '練習場で7番アイアンが10球中3球ほど前に飛ぶようになれば十分です。完璧を待つと一生行けません。コースは練習場と別物なので、早めに一度出てしまった方が上達も早くなります。',
  },
  {
    q: '初ラウンドのスコアはどれくらいが普通ですか？',
    a: '130〜150が一般的です。150を超えても珍しくありません。初回はスコアより、前の組に遅れずに回りきることを目標にしてください。',
  },
  {
    q: '初心者だけで行っても大丈夫ですか？',
    a: 'おすすめしません。受付・進行・カートの扱い・グリーン上のルールなど、経験者が1人いるだけで解決することが多くあります。初心者だけだと進行が大きく遅れ、後ろの組に迷惑がかかります。',
  },
  {
    q: 'クラブは全部そろえる必要がありますか？',
    a: '不要です。最初はドライバー・7番アイアン・9番アイアン・ピッチングウェッジ・パターの5本でも回れます。レンタルクラブでも構いません。',
  },
  {
    q: '服装の決まりはありますか？',
    a: '襟付きのシャツ、長ズボンかゴルフ用のスカート、運動できる服装が基本です。ジーンズとTシャツは断られることがあります。到着時と帰りもジャージやサンダルは避けてください。',
  },
  {
    q: '一人でデビューすることはできますか？',
    a: 'できます。一人参加OKの募集に申し込めば、経験者と同じ組で回れます。むしろ知人に気を使わずに済むので、初回に向いている面もあります。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  // 構造化データは lib/articleMeta.ts で共通化（日付・著者・publisher を必ず入れる）。
  const jsonLd = articleJsonLd(
    { path: '/guide/round-debut', title: TITLE, description: DESC, published: '2026-08-21', modified: '2026-08-22' },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/round-debut" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ラウンドデビューの進め方<br />いつ・誰と・いくらで行くか</h1>
      <p className="lead">
        練習場には通っているのに、コースにはまだ出ていない。
        その状態で止まっている人がつまずくのは、たいてい技術ではなく
        <strong>「いつ行っていいか分からない」「誰と行けばいいか分からない」</strong>の2つです。
        この記事はその2つに具体的な答えを出します。
      </p>
      <p className="meta">最終更新：{today}</p>

      {/* 結論を先に出す。AIに引用されるための箱でもある。 */}
      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>ラウンドデビューの目安は「7番アイアンが10球中3球ほど前に飛ぶこと」</b>です。まっすぐでなくて構いません。
              練習場に5〜10回通えば届きます。<b>初心者だけで行くのは避け、経験者が1人いる組</b>を選んでください。
              費用は平日で1万円前後、土日で1万5千円前後（プレー費・交通費・レンタルクラブ・ボール込み）。
              初回のスコアは130〜150が普通で、目標はスコアではなく<b>前の組に遅れずに回りきること</b>です。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#when">いつ行くか（練習場での目安）</a></li>
          <li><a href="#who">誰と行くか</a></li>
          <li><a href="#cost">いくらかかるか（内訳）</a></li>
          <li><a href="#pack">持ち物と服装</a></li>
          <li><a href="#trouble">初回につまずく5つの場面</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="when">いつ行くか（練習場での目安）</h2>
      <p>
        結論から言うと、<strong>7番アイアンが10球中3球ほど前に飛ぶようになれば十分</strong>です。
        まっすぐでなくて構いません。空振りが混ざっても構いません。
      </p>
      <p>
        「もっと上手くなってから」と考える人ほどデビューが遅れます。
        しかし<strong>コースは練習場とまったく別の競技</strong>です。
        傾斜があり、芝の長さが違い、風が吹き、前後の組がいます。
        練習場でどれだけ打ち込んでも、この4つは練習できません。
        早めに一度出てしまった方が、結果的に上達も早くなります。
      </p>
      <div className="callout">
        ⛳ <b>目安のまとめ</b><br />
        ・練習場に通った回数：5〜10回<br />
        ・7番アイアン：10球中3球が前に飛ぶ<br />
        ・パター：まっすぐ転がせる（入らなくていい）<br />
        この3つが揃えば、あとは行くだけです。
      </div>

      <h2 id="who">誰と行くか</h2>
      <p>
        ここが本当の難所です。<strong>初心者だけで行くのは避けてください</strong>。
        受付の手順、カートの動かし方、グリーン上のルール、打つ順番、
        ボールを見失ったときの処理。これらは経験者が1人いるだけで全部解決します。
        逆に全員が初心者だと、1ホールごとに詰まって進行が大きく遅れます。
      </p>
      <h3>選択肢は3つ</h3>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>誰と行くか</th><th>良い点</th><th>難しい点</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>ゴルフをやる知人に頼む</b></td>
              <td className="ok">気楽。事情も分かってくれる</td>
              <td>そもそも周りにいないことが多い</td>
            </tr>
            <tr>
              <td><b>スクールのデビュー企画</b></td>
              <td>同じレベルの人と行ける</td>
              <td className="ng">月謝がかかる。日程が選べない</td>
            </tr>
            <tr>
              <td><b>初心者歓迎の募集に申し込む</b></td>
              <td className="ok">経験者の組に一人で入れる。日程を選べる</td>
              <td>初対面なので最初は緊張する</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        3つめは意外に思われるかもしれませんが、
        <strong>「初対面だからこそ気を使わずに済む」</strong>という面があります。
        知人が相手だと「下手なところを見せたくない」という気持ちが働きますが、
        初対面なら最初から初心者として扱ってもらえます。
      </p>

      {hasFillData(s) && (
        <>
          <div className="data">
            <div className="dt">⛳ 実際の参加者データ（{today}時点・ゴルトモ）</div>
            <div className="dg">
              {s.avgAge != null && (
                <div className="dc">
                  <div className="dv">{s.avgAge}歳</div>
                  <div className="dl">参加者の平均年齢</div>
                  <div className="dn">20〜30代限定</div>
                </div>
              )}
              <div className="dc">
                <div className="dv">{s.fillRate}%</div>
                <div className="dl">募集が満員に</div>
                <div className="dn">完了した{s.fillN}件の平均充足率</div>
              </div>
              {hasAgainData(s) && (
                <div className="dc">
                  <div className="dv">{s.againRate}%</div>
                  <div className="dl">また回りたい</div>
                  <div className="dn">一緒に回った後の評価{s.againN}件</div>
                </div>
              )}
              {s.femaleRate != null && (
                <div className="dc">
                  <div className="dv">{100 - s.femaleRate}:{s.femaleRate}</div>
                  <div className="dl">男女比</div>
                  <div className="dn">男性{100 - s.femaleRate}% ／ 女性{s.femaleRate}%</div>
                </div>
              )}
            </div>
            <div className="note">※ サービス内の実データを自動集計しています。母数も併記しています。</div>
          </div>
        </>
      )}

      <h2 id="cost">いくらかかるか（内訳）</h2>
      <p>
        「ゴルフは金がかかる」と言われますが、実際の内訳を見ると印象は変わります。
        <strong>平日に行けば、1回あたりは飲み会2回分ほど</strong>です。
      </p>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>項目</th><th>目安</th><th>備考</th></tr>
          </thead>
          <tbody>
            {COST.map((c) => (
              <tr key={c.n}>
                <td><b>{c.n}</b></td><td>{c.v}</td><td>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        初回はクラブとボールが加わるので、<strong>平日で1万円前後、土日で1万5千円前後</strong>を見ておけば足ります。
        費用を抑えたいなら、<strong>平日・相乗り・レンタルクラブ</strong>の3つが効きます。
      </p>

      <h2 id="pack">持ち物と服装</h2>
      <h3>必ず要るもの</h3>
      <p>
        クラブ（5本でも可）、ゴルフシューズ、グローブ、ボール1ダース、ティー、マーカー、
        襟付きシャツ、長ズボン（またはゴルフ用スカート）。
      </p>
      <h3>あると助かるもの</h3>
      <p>
        日焼け止め、飲み物、タオル、着替え、絆創膏。
        夏場は塩分のタブレットもあると違います。
      </p>
      <div className="callout">
        👕 <b>服装で断られないために</b><br />
        ジーンズ・Tシャツ・サンダルは避けてください。到着時と帰りの服装も見られます。
        迷ったら「襟付き＋長ズボン」で問題ありません。
      </div>

      <h2 id="trouble">初回につまずく5つの場面</h2>
      <h3>1. 受付で何を言えばいいか分からない</h3>
      <p>名前を言うだけです。組の代表者名を聞かれることがあるので、事前に確認しておくと安心です。</p>
      <h3>2. 打つ順番が分からない</h3>
      <p>基本はカップから遠い人からです。ただし初心者は「先に打っていいよ」と言われることが多いので、その場合は素直に従ってください。</p>
      <h3>3. ボールを見失う</h3>
      <p>必ず起きます。<strong>探すのは3分まで</strong>と決めて、見つからなければ新しいボールを近くに置いて打ち直してください。進行の遅れが一番の迷惑です。</p>
      <h3>4. 打数が分からなくなる</h3>
      <p>初回は正確でなくて構いません。おおよそで数えて、分からなくなったら「たぶん10です」で通ります。</p>
      <h3>5. グリーンで何をすればいいか分からない</h3>
      <p>ボールの位置にマーカーを置いてボールを拾う、これだけ覚えておけば十分です。あとは同伴者の動きを真似してください。</p>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>初心者歓迎の募集を見る</h2>
        <p>
          20〜30代限定。募集ごとに条件が書かれているので、初心者歓迎のものだけ選べます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_debut" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_debut">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">関連する記事</div>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">1人予約と一人参加の違い・当日の流れ</span>
        </a>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">費用・すぐ行けるか・気まずさで比較</span>
        </a>
        <a href="/guide/golf-without-car">
          <span className="l">車がなくてもゴルフに行く方法</span>
          <span className="n">送迎・バス・相乗りの3つ</span>
        </a>
        <a href="/about">
          <span className="l">ゴルトモとは</span>
          <span className="n">20〜30代限定のゴルフ友達マッチング</span>
        </a>
      </div>
    </ArticleShell>
  );
}
