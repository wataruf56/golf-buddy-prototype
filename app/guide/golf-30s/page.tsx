import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ 30代」で上位を狙う記事。
//
// 20代の記事と near-duplicate にしないため、切り口を明確に分ける。
//   20代 … 費用・道具・そもそも周りにやる人がいない
//   30代 … 仕事の付き合いで必要になる・時間が取れない・接待の前の練習
// /type の16ページで学んだとおり、判断すべきは「ページ全体の文字数」ではなく
// 「他ページと共通の定型文を除いた固有本文」なので、本文はほぼ全文を書き下ろす。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/golf-30s`;
const TITLE = '30代からのゴルフ｜仕事で必要になった人と、趣味で始める人へ';
const DESC =
  '30代でゴルフを始める人の多くは、仕事の付き合いか、友人の誘いがきっかけです。接待ラウンドの前に何を済ませておくべきか、時間が取れない中でどう回数を確保するかを、運用データつきでまとめました。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 30代', '30代 ゴルフ', 'ゴルフ 30代 始め方', 'ゴルフ 接待',
    '30代 ゴルフ デビュー', 'ゴルフ 同世代', 'ゴルフ友達 探し', 'ラウンド募集',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: '30代からのゴルフ｜仕事で始める人と、趣味で始める人へ',
    description: '接待の前に済ませておくこと、時間が取れない中での回数の作り方を実データつきで。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

// 接待・コンペの前に、気楽なラウンドで先に潰しておくべきこと。
// スイングの話ではなく「同伴者に迷惑をかける所作」に絞る。
const BEFORE_WORK = [
  {
    n: '進行のペースをつかむ',
    note: '打数より、遅れないことのほうが重視されます。自分の番が来る前に構えを決めておく、走らないまでも早歩きで移動する。これだけで印象がまるで違います。',
  },
  {
    n: 'バンカーとグリーンの後始末',
    note: 'バンカーは自分の足跡をならす、グリーンはボール跡を直す。知らないと確実に目につきます。1回でも本番前に経験しておけば身につきます。',
  },
  {
    n: 'スコアの数え方と申告',
    note: '自分のスコアを自分で数えられないと、同伴者の手間になります。数え方はラウンドを1回すればすぐ慣れます。',
  },
  {
    n: 'カートの運転と置き場所',
    note: '若手が運転を任されることが多い役回りです。次のホールの方向、置く位置。これも1回経験しておくと違います。',
  },
  {
    n: '服装とロッカーの流れ',
    note: '受付・着替え・スタート前の練習・精算まで、コースには一連の流れがあります。初めてだと、ここで一番もたつきます。',
  },
];

const FAQ = [
  {
    q: '30代からゴルフを始めるのは遅いですか？',
    a: '遅くありません。30代で始める人が最も多く、仕事の付き合いをきっかけにするケースが目立ちます。体力的にも問題なく、上達に必要なのは年齢より回数です。',
  },
  {
    q: '接待ゴルフの前に、何回くらい練習ラウンドをしておくべきですか？',
    a: 'コースを3回ほど回っておくと、進行・所作・当日の流れで慌てなくなります。スコアはこの時点では気にしなくて構いません。同伴者が気にするのは打数ではなく進行です。',
  },
  {
    q: '30代で仕事が忙しく、時間が取れません。',
    a: '練習場に毎週通うより、ラウンドの回数を確保するほうが上達します。土日の早朝スタートなら昼過ぎに終わるため、1日を丸ごと使わずに済みます。',
  },
  {
    q: '同世代とだけ回ることはできますか？',
    a: 'できます。ゴルトモは20〜30代限定で運用しているため、参加した先に同世代がいます。ゴルフ場の1人予約と違い、年代がばらけることがありません。',
  },
  {
    q: '30代でゴルフを始めると、いくらくらいかかりますか？',
    a: '道具を中古で揃えれば初年度10万円前後です。30代は予算より時間が制約になることが多いので、平日に休みが取れるかどうかで回れる回数が変わります。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const showAge = s.avgAge != null && s.ageN >= 20;
  const showAgain = s.againRate != null && s.againN >= 20;
  const showFill = s.fillRate != null && s.fillN >= 3;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = articleJsonLd(
    { path: '/guide/golf-30s', title: TITLE, description: DESC, published: '2026-08-31', modified: '2026-08-31' },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/golf-30s" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>30代からのゴルフ<br />仕事で必要になった人と、趣味で始める人へ</h1>
      <p className="lead">
        30代でゴルフを始める理由は、だいたい2つに分かれます。
        <strong>仕事の付き合いで必要になったか、友人に誘われたか。</strong>
        どちらから入ったかで、最初にやるべきことが変わります。この記事では両方の道筋を書きます。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>30代でゴルフを始めるのは遅くありません。</b>むしろ最も人数の多い年代です。
          仕事の付き合いがきっかけなら、<b>接待やコンペの前に、気楽なラウンドを3回ほど済ませておく</b>のが最短です。
          同伴者が見ているのは打数ではなく<b>進行と所作</b>で、これは練習場では身につきません。
          時間が取れない場合は、練習場の回数より<b>ラウンドの回数</b>を優先してください。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#two">30代の入り口は2つある</a></li>
          <li><a href="#before">接待・コンペの前に済ませておくこと</a></li>
          <li><a href="#time">時間が取れない30代のラウンドの組み立て方</a></li>
          <li><a href="#same">なぜ同世代と回っておくとよいのか</a></li>
          <li><a href="#data">続いているかどうか（運用データ）</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="two">30代の入り口は2つある</h2>
      <h3>仕事の付き合いから入る場合</h3>
      <p>
        「今度コンペがあるから」「取引先とラウンドすることになった」。
        30代で最も多い入り方です。この場合、<strong>締め切りがある</strong>のが特徴です。
        いつまでに間に合わせるかが決まっているので、練習の順番を間違えると本番で困ります。
      </p>
      <p>
        ここで多くの人がやってしまうのが、
        <strong>練習場に通い詰めてスイングを固めようとすること</strong>です。
        ところが本番で恥をかくのはスイングではありません。進行が遅い、バンカーをならさない、
        カートの置き場所が分からない。<strong>コースに出ないと分からないことばかりです。</strong>
      </p>
      <h3>趣味として始める場合</h3>
      <p>
        友人に誘われた、健康のために体を動かしたい、という入り方です。
        締め切りがない代わりに、<strong>一緒に回る人がいなくなると自然に止まります。</strong>
        誘ってくれた友人の予定が合わなくなると、そこで途切れてしまうのが典型的なパターンです。
      </p>
      <div className="callout">
        入り口はどちらでも、<strong>続くかどうかは「気楽に誘い合える相手が何人いるか」で決まります。</strong>
        1人だと、その人の都合で止まります。3〜4人いると止まりません。
      </div>

      <h2 id="before">接待・コンペの前に済ませておくこと</h2>
      <p>
        本番の前に気楽なラウンドを何回か済ませておくと、当日の負担がまるで違います。
        <strong>先に潰しておくべきなのは、スイングではなく次の5つです。</strong>
      </p>
      <div className="tbl">
        <table>
          <thead><tr><th>先に済ませること</th><th>なぜ本番で効くか</th></tr></thead>
          <tbody>
            {BEFORE_WORK.map((b) => (
              <tr key={b.n}><td><b>{b.n}</b></td><td>{b.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>目安は3回です。</strong>1回だと流れを追うだけで終わり、
        3回目あたりから自分の番以外にも目が向くようになります。
      </p>
      <p>
        練習ラウンドの相手は、<strong>職場の人ではないほうが気楽です。</strong>
        上司の前で初めてのバンカーに入るより、利害関係のない同世代と失敗しておくほうが、
        本番での余裕につながります。
      </p>

      <h2 id="time">時間が取れない30代のラウンドの組み立て方</h2>
      <p>
        30代の制約は、20代と違ってお金よりも<strong>時間</strong>です。
        限られた中で回数を確保する方法を3つ挙げます。
      </p>
      <h3>早朝スタートを使う</h3>
      <p>
        土日の早朝（6〜7時台）スタートなら、昼過ぎには終わります。
        <strong>1日を丸ごと使わずに済む</strong>ので、家庭がある人でも組みやすくなります。
        早朝枠はプレー代も安めです。
      </p>
      <h3>練習場よりラウンドを優先する</h3>
      <p>
        練習場に月4回通うより、<strong>ラウンドに月1回行くほうが上達します。</strong>
        時間が有限なら、迷わずラウンドに寄せてください。
        練習場は「ラウンドで困った1点だけを直す場所」と割り切ると、短時間で済みます。
      </p>
      <h3>送迎を前提に組む</h3>
      <p>
        自分で運転して往復すると、それだけで疲れます。
        <strong>誰かの車に乗せてもらう前提で募集を選ぶ</strong>と、往復の時間を休息に回せます。
      </p>

      <h2 id="same">なぜ同世代と回っておくとよいのか</h2>
      <p>
        30代は、仕事のラウンドでは<strong>ほぼ年上と回ります。</strong>
        気を使う時間が長く、それ自体は仕事なので仕方がありません。
      </p>
      <p>
        だからこそ、<strong>気を使わないラウンドを別に持っておくこと</strong>に意味があります。
        同世代なら、予算感もペースも近く、「今日はこの安いコースでいい」が通じます。
        スコアが崩れても笑って終われます。
      </p>
      <p>
        ゴルフ場の1人予約は手軽ですが、<strong>同伴者の年代を選べません。</strong>
        30代が申し込んで50〜60代の3人組に入ると、結局それも気を使うラウンドになります。
        ゴルトモが<strong>20〜30代限定</strong>にしているのは、この一点のためです。
      </p>

      <h2 id="data">続いているかどうか（運用データ）</h2>
      <p>
        「一度きりで終わらないか」が、30代にとって一番気になるところだと思います。
        実際に運用しているゴルトモの数字を出します。
      </p>
      {(showAge || showAgain || showFill) ? (
        <div className="data">
          <div className="dt">⛳ ゴルトモの実績（{today} 時点）</div>
          <div className="dg">
            {showAgain && (
              <div className="dc">
                <div className="dv">{s.againRate}%</div>
                <div className="dl">また回りたいと答えた割合</div>
                <div className="dn">n={s.againN}件</div>
              </div>
            )}
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
            {s.totalPlayers > 0 && (
              <div className="dc">
                <div className="dv">{s.totalPlayers}人</div>
                <div className="dl">のべ参加人数</div>
                <div className="dn">同じ人の重複を含む</div>
              </div>
            )}
          </div>
          <div className="note">
            ※ ラウンド後、参加者どうしが匿名で「また回りたいか」を答えた結果です。
            母数が少ない項目は表示していません。数字はページを開くたびに集計し直しています。
          </div>
        </div>
      ) : (
        <p>
          現在集計中です。母数が少ないうちは、実態とかけ離れた数字が出るため公開していません。
        </p>
      )}

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>気を使わないラウンドを1本持つ</h2>
        <p>
          20〜30代限定。一人で参加して、また回りたい人を見つけられます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_30s" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_30s">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/golf-20s">
          <span className="l">20代のゴルフの始め方</span>
          <span className="n">費用・道具・一緒に回る人</span>
        </a>
        <a href="/guide/round-debut">
          <span className="l">ラウンドデビューの進め方</span>
          <span className="n">初めてコースに出る人へ</span>
        </a>
        <a href="/guide/round-recruit">
          <span className="l">ゴルフのラウンド募集</span>
          <span className="n">集まる募集の書き方と選び方</span>
        </a>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">ゴルフ友達探しの方法を比較</span>
        </a>
      </div>
    </ArticleShell>
  );
}
