import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ 20代」で上位を狙う記事。
//
// この語で上位に出るのは「20代のうちに始めるべき理由」を説く一般論か、
// 用品店の商品ページばかりで、20代が実際に詰まる場所を書いたものが無い。
// ゴルトモは20〜30代限定で運用しているので、**この年代だけの実数**
// （平均年齢・女性比率・満員率）を根拠として出せるのが決定的な差になる。
//
// 30代の記事と内容が重ならないよう、20代側は「費用」「道具」「周りに
// やる人がいない」に寄せる。30代側は「仕事の付き合い」「時間」に寄せる。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/golf-20s`;
const TITLE = '20代のゴルフの始め方｜費用・道具・一緒に回る人の見つけ方';
const DESC =
  '20代でゴルフを始めるときの現実的な費用、最初に揃える道具、そして一番の壁になる「一緒に回る人」の作り方をまとめました。同世代だけで回る方法と、実際の参加者データも公開します。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 20代', '20代 ゴルフ', 'ゴルフ 20代 始め方', 'ゴルフ 20代 費用',
    'ゴルフ 20代 女子', 'ゴルフ 同世代', 'ゴルフ友達 探し', 'ラウンド募集',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: '20代のゴルフの始め方｜費用・道具・一緒に回る人',
    description: '20代が実際に詰まるのは費用より「一緒に回る人」。同世代と回る方法を実データつきで。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

// 20代が最初の1年でかかる費用。幅を持たせて、上限も隠さずに書く。
const COSTS = [
  {
    n: 'クラブ一式', low: '3万円', high: '15万円',
    note: '中古のセットなら3〜5万円で揃います。新品のフルセットで10万円前後。最初から高いものを買う必要はまったくありません。',
  },
  {
    n: '練習場（月2回）', low: '3,000円', high: '6,000円',
    note: '1回あたり1,500〜3,000円ほど。打ち放題の店なら回数を増やしても金額は変わりません。',
  },
  {
    n: 'ラウンド1回', low: '7,000円', high: '15,000円',
    note: '平日と土日で倍近く違います。20代のうちは、まず平日か、土日でも安いコースから始めるほうが続きます。',
  },
  {
    n: '靴・グローブ・ボール', low: '8,000円', high: '2万円',
    note: 'シューズだけは自分の足に合うものを買ってください。借り物の靴で18ホール歩くと、翌日まで足に残ります。',
  },
  {
    n: 'ウェア', low: '0円', high: '2万円',
    note: '襟付きのシャツとチノパンがあれば、たいていのコースは通ります。専用ウェアは後から揃えて構いません。',
  },
];

const FAQ = [
  {
    q: '20代でゴルフを始めるのは早すぎますか？',
    a: '早すぎることはありません。むしろ体が動くうちに始めたほうが上達は速く、同世代の友人ができれば10年単位で続く趣味になります。ゴルトモの参加者も20代が中心です。',
  },
  {
    q: '20代でゴルフを始めるのに、いくらくらいかかりますか？',
    a: '中古クラブ一式3〜5万円、練習場が1回1,500〜3,000円、ラウンドが1回7,000〜15,000円です。最初の1年は道具込みで10万円前後を見ておくと現実的です。',
  },
  {
    q: '周りに20代でゴルフをやっている人がいません。',
    a: '20代でゴルフをする人自体は増えていますが、身近な範囲に固まってはいないだけです。年代を指定して一緒に回る人を探せるサービスを使うと、同世代とだけ回れます。',
  },
  {
    q: '20代の女性一人でも参加できますか？',
    a: 'できます。ゴルトモでは女性の参加枠を設けた募集や、ラウンド後の相互レビューで参加者の実績が見える仕組みを用意しています。',
  },
  {
    q: '車がなくてもラウンドに行けますか？',
    a: '行けます。最寄り駅まで迎えに来てもらう「送迎（ピックアップ）」を前提にした募集があります。20代は車を持っていない人のほうが多いので、送迎ありの募集は珍しくありません。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const showAge = s.avgAge != null && s.ageN >= 20;
  const showFill = s.fillRate != null && s.fillN >= 3;
  const showFemale = s.femaleRate != null && s.genderN >= 20;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = articleJsonLd(
    { path: '/guide/golf-20s', title: TITLE, description: DESC, published: '2026-08-31', modified: '2026-08-31' },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/golf-20s" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>20代のゴルフの始め方<br />費用・道具・一緒に回る人</h1>
      <p className="lead">
        20代でゴルフを始めるとき、実際に詰まるのは費用ではありません。
        <strong>道具を揃えて練習場に通ったあと、一緒にコースへ行く人がいない</strong>ところで止まります。
        この記事では、かかるお金を正直に並べたうえで、その先の壁の越え方を書きます。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>20代でゴルフを始めるなら、最初の1年は道具込みで10万円前後</b>が現実的です。
          中古クラブ一式3〜5万円、練習場1回1,500〜3,000円、ラウンド1回7,000〜15,000円。
          ただし<b>本当の壁はお金ではなく「一緒に回る人」</b>で、
          周りに20代のゴルファーがいない場合は、<b>年代を指定して一緒に回る人を探せるサービス</b>を使うのが最短です。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#wall">20代が詰まるのは、お金より「一緒に回る人」</a></li>
          <li><a href="#cost">20代がゴルフを始める費用</a></li>
          <li><a href="#gear">道具は最初から揃えなくていい</a></li>
          <li><a href="#friends">同世代と回るには</a></li>
          <li><a href="#data">20代・30代がどれくらい集まっているか（運用データ）</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="wall">20代が詰まるのは、お金より「一緒に回る人」</h2>
      <p>
        ゴルフを始めるときの情報は、道具の選び方とスイングの練習法に偏っています。
        ところが20代が実際に止まるのは、その先です。
      </p>
      <p>
        練習場に何度か通って、そこそこ当たるようになる。
        <strong>そこで「じゃあ誰とコースに行くのか」という問題にぶつかります。</strong>
        職場の先輩に誘われるのは30代以降が多く、20代のうちは声がかかりません。
        同期に聞いてもやっている人がいない。そのまま練習場止まりになります。
      </p>
      <p>
        ゴルフは4人1組で回る競技なので、
        <strong>一人では始められない</strong>という性質があります。
        これが他の趣味と決定的に違う点で、20代がゴルフから離れる一番の理由でもあります。
      </p>
      <div className="callout">
        逆に言えば、<strong>一緒に回る人さえ見つかれば、20代のゴルフはほとんど解決します。</strong>
        道具も費用も、あとからどうにでもなります。
      </div>

      <h2 id="cost">20代がゴルフを始める費用</h2>
      <p>
        金額を先に出しておきます。上限も隠さずに書いていますが、
        <strong>左の列（安いほう）で始めて何も問題ありません。</strong>
      </p>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>項目</th><th>安く済ませる</th><th>こだわる</th><th>補足</th></tr>
          </thead>
          <tbody>
            {COSTS.map((c) => (
              <tr key={c.n}>
                <td><b>{c.n}</b></td>
                <td>{c.low}</td>
                <td>{c.high}</td>
                <td>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        まとめると、<strong>道具を中古で揃えて月2回の練習と月1回のラウンドなら、
        最初の1年で10万円前後</strong>。2年目以降は道具代が消えるので、年5〜8万円ほどで続けられます。
      </p>
      <p>
        20代にとって決して安くはありませんが、
        <strong>ラウンド代は平日と土日で倍近く違います。</strong>
        休みを平日に取れるなら、同じ予算で回れる回数が倍近くになります。
      </p>

      <h2 id="gear">道具は最初から揃えなくていい</h2>
      <h3>最初に買うべきもの</h3>
      <p>
        <strong>シューズだけは自分に合うものを買ってください。</strong>
        18ホールは6〜7km歩きます。合わない靴で回ると、翌日まで足に残って「もう行きたくない」に直結します。
        グローブとボールも消耗品なので自前で持ちます。ここまでで1万円前後です。
      </p>
      <h3>後回しでいいもの</h3>
      <p>
        クラブは<strong>中古のセットで十分</strong>です。20代のうちは、道具の差よりスイングの差のほうが
        はるかに大きく出ます。ウェアも、襟付きのシャツとチノパンがあればたいていのコースは通ります。
        ドレスコードが厳しいコースは、募集の段階で分かることがほとんどです。
      </p>
      <h3>買わなくていいもの</h3>
      <p>
        距離計・キャディバッグの高級品・複数本のドライバーは、しばらく不要です。
        <strong>最初の10ラウンドくらいは、道具を増やすより回数を増やすほうが上達します。</strong>
      </p>

      <h2 id="friends">同世代と回るには</h2>
      <p>
        20代がゴルフを続けられるかどうかは、ほぼここで決まります。方法は4つあります。
      </p>
      <h3>1. 職場・友人のつて</h3>
      <p>
        一番気楽ですが、20代のうちはそもそも周りにやる人が少ないのが実情です。
        いたとしても年上で、腕前も予算感も合わないことがあります。
      </p>
      <h3>2. ゴルフ場の1人予約</h3>
      <p>
        すぐ回れるのが利点です。ただし<strong>同伴者の年代を選べません。</strong>
        20代が申し込むと、50〜60代の3人組に入ることが珍しくありません。
        ラウンド自体はできますが、その日限りで終わり、友達にはなりません。
      </p>
      <h3>3. SNSで募集する</h3>
      <p>
        無料で始められますが、<strong>相手の素性も実績も見えません。</strong>
        ドタキャンされても打つ手がなく、当日まで不安が残ります。
      </p>
      <h3>4. 年代を指定できるマッチングサービス</h3>
      <p>
        20代にとって現実的なのはこれです。ゴルトモは<strong>20〜30代限定</strong>で運用しているので、
        参加した先に必ず同世代がいます。ラウンド後に<strong>お互いをレビューする仕組み</strong>があるため、
        「変な人が来たらどうしよう」という不安も、事前に確認できる形になります。
      </p>
      <div className="callout">
        年代を絞ることの意味は、話が合うことだけではありません。
        <strong>予算感とペースが揃う</strong>のが大きいです。
        「今日はこの安いコースでいい」が通じる相手と回れると、続けやすくなります。
      </div>

      <h2 id="data">20代・30代がどれくらい集まっているか（運用データ）</h2>
      <p>
        一般論ではなく、実際に運用しているゴルトモの数字を出します。
        母数が少ないうちは数字を出さない方針なので、下に出ていない項目はまだ集計中です。
      </p>
      {(showAge || showFill || showFemale) ? (
        <div className="data">
          <div className="dt">⛳ ゴルトモの実績（{today} 時点）</div>
          <div className="dg">
            {showAge && (
              <div className="dc">
                <div className="dv">{s.avgAge}歳</div>
                <div className="dl">参加者の平均年齢</div>
                <div className="dn">n={s.ageN}人</div>
              </div>
            )}
            {showFill && (
              <div className="dc">
                <div className="dv">{s.fillRate}%</div>
                <div className="dl">募集が満員になった割合</div>
                <div className="dn">n={s.fillN}件</div>
              </div>
            )}
            {showFemale && (
              <div className="dc">
                <div className="dv">{s.femaleRate}%</div>
                <div className="dl">女性の割合</div>
                <div className="dn">n={s.genderN}人</div>
              </div>
            )}
            {s.totalPlayers > 0 && (
              <div className="dc">
                <div className="dv">{s.totalPlayers}人</div>
                <div className="dl">のべ参加人数</div>
                <div className="dn">同じ人の重複を含む</div>
              </div>
            )}
          </div>
          <div className="note">
            ※ 20〜30代限定で運用しているため、平均年齢はこの範囲に収まります。
            数字はページを開くたびに集計し直しています。
          </div>
        </div>
      ) : (
        <p>
          現在集計中です。母数が少ないうちは、実態とかけ離れた数字が出るため公開していません。
        </p>
      )}
      <p>
        平均年齢が20代後半に収まっているということは、
        <strong>20代で申し込んでも「自分だけ浮く」ことにはならない</strong>ということです。
        1人予約との一番大きな違いがここにあります。
      </p>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>同世代と回る</h2>
        <p>
          20〜30代限定。一人で参加して、また回りたい人を見つけられます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_20s" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_20s">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/golf-30s">
          <span className="l">30代からのゴルフ</span>
          <span className="n">仕事で必要になった人と、趣味で始める人へ</span>
        </a>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">ゴルフ友達探しの方法を比較</span>
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
