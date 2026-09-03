import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd, SITE } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';
import { getAreaStats } from '@/lib/areaStats';

// 地域ページの共通の器。
//
// 【なぜ「東京×20代」「東京×30代」で分けないか】
// 分けると、県名と年代だけが違うほぼ同じページが6枚できる。
// /type の16ページで学んだとおり、近い題材のページは「共通の定型文を除いた
// 固有本文」で見ないと near-duplicate に気づけない。年代だけで書き分けられる
// ことは多くないので、**1つの地域ページで20代と30代の両方に答える**。
// Googleは「東京 20代」でも「東京 30代」でも同じページを出せる。
//
// 【薄いページにしないために】
// 差し込むのは県名ではなく、その地域の**実数と事実**にする。
//   ・その県に住んでいる会員数（実データ）
//   ・その県で開かれたラウンド数（実データ）
//   ・送迎で拾える駅（その県のもの）
//   ・行き先がどこに集中しているか（実データ）
// 数字が小さいところは小さいまま出す。大きく見せると、来た人が実物を見て離れる。

export type AreaCopy = {
  /** '東京都' など。実データの照合キーにもなる */
  area: string;
  /** URL の slug（'tokyo'） */
  slug: string;
  /** '東京' など、文中で使う短い呼び方 */
  short: string;
  title: string;
  desc: string;
  /** その地域ならではの事情。1〜2段落 */
  intro: string;
  /** 行き先エリアの説明（房総／西湘 など） */
  destination: string;
  /** 移動の実際 */
  access: string;
};

export async function AreaGuide({ copy }: { copy: AreaCopy }) {
  const [s, a] = await Promise.all([getGuideStats(), getAreaStats(copy.area)]);
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');
  const path = `/guide/golf-${copy.slug}`;

  const FAQ = [
    {
      q: `${copy.short}に住んでいますが、20代でも一緒に回る人は見つかりますか？`,
      a: `見つかります。ゴルトモは20〜30代限定で運用しているので、参加した先に必ず同世代がいます。`
        + `${a.members > 0 ? `${copy.short}にお住まいの会員は現在${a.members}人です。` : ''}`
        + `ゴルフ場の1人予約と違い、同伴者が親世代になることがありません。`,
    },
    {
      q: `30代からゴルフを始めても大丈夫ですか？`,
      a: '大丈夫です。30代で始める人が最も多く、仕事の付き合いがきっかけになるケースが目立ちます。'
        + 'スコアは「ラウンド未経験」から選べるので、初めてでも申し込めます。',
    },
    {
      q: `${copy.short}から車がなくてもゴルフに行けますか？`,
      a: `行けます。${a.stations.length ? `${a.stations.slice(0, 4).join('・')}などの駅まで迎えに来てもらう「送迎（ピックアップ）」を前提にした募集があります。` : '最寄り駅まで迎えに来てもらう「送迎（ピックアップ）」を前提にした募集があります。'}`
        + '20代は車を持っていない人のほうが多いので、送迎ありの募集は珍しくありません。',
    },
    {
      q: '費用はどれくらいかかりますか？',
      a: 'ラウンド1回で7,000〜15,000円（平日と土日で倍近く違います）。ゴルトモの利用自体は無料です。',
    },
    {
      q: '一人で申し込んでも浮きませんか？',
      a: '浮きません。参加者の多くが単独で申し込んでいます。ラウンド後に参加者どうしが匿名で評価を残す仕組みがあるため、初対面でも荒れにくくなっています。',
    },
  ];

  const jsonLd = articleJsonLd(
    { path, title: copy.title, description: copy.desc, published: '2026-09-01', modified: '2026-09-01' },
    FAQ,
  );

  return (
    <ArticleShell current={path} page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="パンくず" className="meta">
        <a href="/">ホーム</a> ／ <a href="/guides">ガイド</a> ／ {copy.short}
      </nav>

      <h1>{copy.short}の20代・30代がゴルフ仲間を見つけるには</h1>
      <p className="lead">{copy.intro}</p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">結論</span>
        <p>
          {copy.short}で一緒に回る人を探すなら、<b>年代を指定できる場を使うのが最短</b>です。
          ゴルフは4人1組なので一人では始められず、
          <b>周りに同世代のゴルファーがいないところで止まる人がいちばん多い</b>からです。
          {a.members > 0 && <>いま{copy.short}には<b>{a.members}人</b>の会員がいます。</>}
          {a.stations.length > 0 && <>車がなくても、{a.stations.slice(0, 3).join('・')}などの駅から送迎してもらえます。</>}
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#where">{copy.short}からどこのコースへ行くか</a></li>
          <li><a href="#car">車がない人はどうするか</a></li>
          <li><a href="#age">20代と30代で事情が違うところ</a></li>
          <li><a href="#data">{copy.short}の実データ</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="where">{copy.short}からどこのコースへ行くか</h2>
      <p>{copy.destination}</p>
      {a.courses.length > 0 && (
        <div className="callout">
          実際によく使われているコース：<strong>{a.courses.join('、')}</strong>
        </div>
      )}
      {a.topDestination && a.topDestination !== copy.area && (
        <p>
          運用しているデータで見ると、ラウンドの行き先は
          <strong>{a.topDestination}に集中しています</strong>（{a.topDestinationRounds}件）。
          {copy.short}に住んでいる人が{a.topDestination}のコースへ出かける、という形です。
          <strong>だから「行き方」が問題になります。</strong>
        </p>
      )}

      <h2 id="car">車がない人はどうするか</h2>
      <p>{copy.access}</p>
      {a.stations.length > 0 && (
        <>
          <h3>{copy.short}で送迎に使われている駅</h3>
          <div className="callout">
            {a.stations.join('・')}
            <br />
            <span style={{ fontSize: '13px' }}>
              これらの駅まで迎えに来てもらう募集があります。一覧に無い駅も、募集を出す人が追加できます。
            </span>
          </div>
        </>
      )}
      <p>
        くわしくは <a href="/guide/golf-without-car">車がない人がゴルフに行く方法</a> にまとめています。
      </p>

      <h2 id="age">20代と30代で事情が違うところ</h2>
      <h3>20代</h3>
      <p>
        詰まるのはお金より<strong>一緒に回る人</strong>です。職場の先輩に誘われるのは30代以降が多く、
        20代のうちは声がかかりません。同期に聞いてもやっている人がいない。
        道具を中古で揃えれば最初の1年は10万円前後で始められるので、
        <strong>費用よりも相手が問題になります</strong>。
        → <a href="/guide/golf-20s">20代のゴルフの始め方</a>
      </p>
      <h3>30代</h3>
      <p>
        入り口は「仕事の付き合い」か「趣味」の2つに分かれます。
        仕事がきっかけなら締め切りがあるので、<strong>接待の前に気楽なラウンドを3回ほど</strong>済ませておくと当日が楽です。
        制約はお金より<strong>時間</strong>で、早朝スタートを使うと1日を丸ごと使わずに済みます。
        → <a href="/guide/golf-30s">30代からのゴルフ</a>
      </p>

      <h2 id="data">{copy.short}の実データ</h2>
      <p>
        一般論ではなく、運用している実数を出します。母数が少ない項目は載せていません。
        <strong>数字が小さいところは小さいまま書いています。</strong>
      </p>
      <div className="data">
        <div className="dt">⛳ {copy.short}の状況（{today} 時点）</div>
        <div className="dg">
          <div className="dc">
            <div className="dv">{a.members}人</div>
            <div className="dl">{copy.short}に住む会員</div>
            <div className="dn">プロフィールの登録エリア</div>
          </div>
          <div className="dc">
            <div className="dv">{a.stations.length}駅</div>
            <div className="dl">送迎で選べる駅</div>
            <div className="dn">{copy.short}のぶん</div>
          </div>
          {s.againRate != null && s.againN >= 20 && (
            <div className="dc">
              <div className="dv">{s.againRate}%</div>
              <div className="dl">また回りたい率</div>
              <div className="dn">全体・n={s.againN}件</div>
            </div>
          )}
          {s.openCount > 0 && (
            <div className="dc">
              <div className="dv">{s.openCount}件</div>
              <div className="dl">いま募集中</div>
              <div className="dn">全国・リアルタイム</div>
            </div>
          )}
        </div>
        <div className="note">
          ※ 動作確認用のアカウントは除いています。ページを開くたびに集計し直しています。
        </div>
      </div>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>{copy.short}で一緒に回る人を探す</h2>
        <p>
          20〜30代限定。アプリのダウンロードは不要で、LINEだけで始められます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href={`https://app.goltomo.com/links/rounds?ref=guide_${copy.slug}`} data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp={`cta_guide_${copy.slug}`}>💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/golf-20s"><span className="l">20代のゴルフの始め方</span><span className="n">費用・道具・一緒に回る人</span></a>
        <a href="/guide/golf-30s"><span className="l">30代からのゴルフ</span><span className="n">仕事で必要になった人と、趣味の人へ</span></a>
        <a href="/guide/golf-without-car"><span className="l">車がなくてもゴルフに行く</span><span className="n">送迎・電車バス・相乗り</span></a>
        <a href="/guide/find-golf-friends"><span className="l">ゴルフ友達探しの方法7つ</span><span className="n">ゴルフ仲間の見つけ方を比較</span></a>
      </div>
    </ArticleShell>
  );
}

/** 地域ページの metadata を組み立てる（各ページから呼ぶ）。 */
export function areaMetadata(copy: AreaCopy) {
  const url = `${SITE}/guide/golf-${copy.slug}`;
  return {
    title: copy.title,
    description: copy.desc,
    keywords: [
      `ゴルフ ${copy.short} 20代`, `ゴルフ ${copy.short} 30代`,
      `ゴルフ ${copy.area} 20代`, `ゴルフ ${copy.area} 30代`,
      `${copy.short} ゴルフ 仲間`, `${copy.short} ゴルフ 友達探し`,
      'ゴルフ 車がない', 'ゴルフ 送迎', 'ゴルフ マッチング',
    ],
    alternates: { canonical: url },
    openGraph: {
      type: 'article' as const, url, siteName: 'ゴルトモ',
      title: copy.title, description: copy.desc,
      images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
    },
  };
}
