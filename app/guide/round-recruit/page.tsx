import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ ラウンド募集」「ラウンド募集」で上位を狙う記事。
//
// この語で検索する人は2種類いて、目的が正反対になる。
//   ① 募集を「出したい」人 … どう書けば集まるかを知りたい
//   ② 募集に「入りたい」人 … どこで探すか・安全かを知りたい
// 1ページで両方に答える。どちらか片方だけだと、もう半分の検索意図を取りこぼす。
//
// 募集が実際どれくらい埋まるかは、運用中の満員率をそのまま出せるのが強み。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/round-recruit`;
const TITLE = 'ゴルフのラウンド募集｜集まる書き方と、参加する側の見極め方';
const DESC =
  'ゴルフのラウンド募集を出す側と、参加する側の両方をまとめました。人が集まる募集に共通する5つの条件、そのまま使える書き方、募集を選ぶときに確認すべき点を、実際の満員率データとあわせて解説します。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ ラウンド募集', 'ラウンド募集', 'ゴルフ 募集', 'ゴルフ 一人参加',
    'ゴルフ メンバー募集', 'ゴルフ 同伴者 募集', 'ゴルフ友達 探し', 'ゴルフ 20代 30代',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルフのラウンド募集｜集まる書き方と選び方',
    description: '人が集まる募集の5条件と、参加する側の見極め方。実際の満員率も公開。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

// 集まる募集に共通していること。実際に満員になった募集から抜き出した観点。
const FILL_FACTORS = [
  {
    n: '日付が決まっている',
    why: '「いつか行きましょう」は誰も動けません。日付が入っているだけで、相手は自分の予定と照らして即答できます。',
  },
  {
    n: '場所と最寄り駅が書いてある',
    why: 'コース名だけだと、行けるかどうかの判断ができません。最寄り駅と、そこから車で何分かまで書くと反応が変わります。',
  },
  {
    n: '費用の目安が入っている',
    why: 'プレー代がいくらか分からない募集には申し込みにくいものです。「7,000〜9,000円（昼食込み）」程度の粒度で十分です。',
  },
  {
    n: '腕前のハードルを下げている',
    why: '「初心者歓迎」「スコアは気にしません」の一言があるかどうかで、申し込みの数がはっきり変わります。上手い人だけを集めたい募集は埋まりにくくなります。',
  },
  {
    n: '送迎の有無が書いてある',
    why: 'ゴルフ場は駅から遠く、車の有無が最大の壁です。「◯◯駅まで迎えに行けます」と書くと、車のない人がまとめて動きます。',
  },
];

// 参加する側が募集を見るときのチェック項目
const CHECKS = [
  { n: '主催者の実績が見えるか', note: '過去に何回ラウンドを開いたか、参加した人の評価があるか。ここが見えない募集は、当日まで不安が残ります。' },
  { n: '参加者の年代が分かるか', note: '年代がばらけると、ペースも予算感も合いません。年代を指定できる場か、参加者が見える場を選んでください。' },
  { n: '費用の内訳が書いてあるか', note: 'プレー代のほかに、キャディ代・カート代・昼食代・参加費がかかることがあります。当日の請求で驚かないように確認します。' },
  { n: '集合時刻と解散時刻', note: '早朝スタートなら昼過ぎに終わります。終了時刻が読めると予定を組みやすくなります。' },
  { n: 'ドタキャン時にどうなるか', note: 'キャンセル料がかかるか、代わりの人を探すのか。ここを決めていない募集は、当日トラブルになりやすいところです。' },
];

const FAQ = [
  {
    q: 'ゴルフのラウンド募集はどこで出せますか？',
    a: 'SNS（XやInstagram）、ゴルフ場の1人予約、マッチングアプリの3つが主な場所です。SNSは無料ですが相手の実績が見えず、1人予約は相手を選べません。年代や腕前を指定したい場合は、募集機能のあるサービスを使うのが確実です。',
  },
  {
    q: 'ラウンド募集を出しても人が集まりません。',
    a: '日付・場所と最寄り駅・費用の目安・腕前のハードル・送迎の有無、この5つが入っているか確認してください。とくに「初心者歓迎」の一言と送迎の記載は、申し込み数がはっきり変わります。',
  },
  {
    q: '一人でラウンド募集に参加しても大丈夫ですか？',
    a: '大丈夫です。ゴルトモの募集は一人での参加が前提で、参加者の多くが単独で申し込んでいます。ラウンド後の相互レビューがあるため、初対面でも荒れにくい仕組みになっています。',
  },
  {
    q: '初心者でもラウンド募集に申し込めますか？',
    a: '申し込めます。ゴルトモではスコア帯を「ラウンド未経験」から選べるようになっており、募集側も初心者を想定したものが多くあります。',
  },
  {
    q: '車がなくてもラウンド募集に参加できますか？',
    a: 'できます。最寄り駅までの送迎（ピックアップ）を前提にした募集があり、駅名まで指定されていることがあります。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const showFill = s.fillRate != null && s.fillN >= 3;
  const showAgain = s.againRate != null && s.againN >= 20;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = articleJsonLd(
    { path: '/guide/round-recruit', title: TITLE, description: DESC, published: '2026-08-31', modified: '2026-08-31' },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/round-recruit" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ゴルフのラウンド募集<br />集まる書き方と、参加する側の見極め方</h1>
      <p className="lead">
        ラウンド募集を検索する人は、<strong>出したい人</strong>と<strong>入りたい人</strong>に分かれます。
        この記事では両方を扱います。前半は人が集まる募集の書き方、後半は募集を選ぶときに確認すべき点です。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>人が集まるラウンド募集には5つの共通点があります。</b>
          日付が決まっている／場所と最寄り駅が書いてある／費用の目安が入っている／
          腕前のハードルを下げている／送迎の有無が書いてある。
          逆に<b>参加する側は、主催者の実績と参加者の年代が見えるかを最優先で確認</b>してください。
          この2つが見えない募集は、当日までリスクが残ります。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#what">ラウンド募集とは</a></li>
          <li><a href="#fill">人が集まる募集の5つの条件</a></li>
          <li><a href="#template">そのまま使える書き方</a></li>
          <li><a href="#check">参加する側の見極め方</a></li>
          <li><a href="#where">どこで募集を出す・探すか</a></li>
          <li><a href="#data">実際どれくらい埋まるのか（運用データ）</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="what">ラウンド募集とは</h2>
      <p>
        ゴルフは4人1組で回る競技です。ところが4人を揃えるのは簡単ではありません。
        <strong>3人までは集まったが、あと1人が埋まらない。</strong>この状態を埋めるのがラウンド募集です。
      </p>
      <p>
        募集を出す側は、足りない人数ぶんの同伴者を集められます。
        参加する側は、<strong>誘ってくれる人がいなくてもコースに出られます。</strong>
        どちらにとっても、ゴルフで一番面倒な「人を揃える」工程を外注する仕組みだと考えてください。
      </p>

      <h2 id="fill">人が集まる募集の5つの条件</h2>
      <p>
        実際に満員になった募集と、集まらなかった募集を見比べると、差はほとんどこの5点に出ます。
        <strong>文章のうまさではありません。</strong>
      </p>
      <div className="tbl">
        <table>
          <thead><tr><th>条件</th><th>なぜ効くのか</th></tr></thead>
          <tbody>
            {FILL_FACTORS.map((f) => (
              <tr key={f.n}><td><b>{f.n}</b></td><td>{f.why}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout">
        5つに共通しているのは、<strong>読んだ人がその場で「行ける／行けない」を判断できること</strong>です。
        質問しないと分からない募集は、質問される前に閉じられます。
      </div>

      <h2 id="template">そのまま使える書き方</h2>
      <p>
        埋めるだけで5つの条件を満たす形にしておきます。
      </p>
      <div className="callout">
        <strong>【日付】</strong>10月12日（日）8:02スタート<br />
        <strong>【コース】</strong>◯◯カントリークラブ（千葉県）／最寄り駅から車で20分<br />
        <strong>【費用】</strong>9,000円前後（昼食・カート代込み）<br />
        <strong>【腕前】</strong>スコアは気にしません。ラウンド未経験の方も歓迎です<br />
        <strong>【送迎】</strong>◯◯駅まで迎えに行けます（2名まで）<br />
        <strong>【募集】</strong>あと2名
      </div>
      <p>
        <strong>意気込みや自己紹介は後ろで構いません。</strong>
        最初に判断材料を置くと、申し込みまでの距離が縮みます。
      </p>
      <h3>やりがちで、集まらなくなる書き方</h3>
      <p>
        「気軽に募集します、日程は相談で」。一見やわらかいのですが、
        <strong>相談が前提だと相手に手間を渡すことになり、そこで止まります。</strong>
        日付は先に決めてしまってください。合わない人は申し込まないだけです。
      </p>
      <p>
        「100切りできる方限定」のように腕前で絞るのも、埋まりにくくなる典型です。
        <strong>実際に必要なのは腕前ではなく、進行を守れるかどうか</strong>なので、
        条件をつけるならそちらを書くほうが機能します。
      </p>

      <h2 id="check">参加する側の見極め方</h2>
      <p>
        募集に申し込むときは、次の5点を確認してください。
        <strong>上の2つが特に重要です。</strong>
      </p>
      <div className="tbl">
        <table>
          <thead><tr><th>確認すること</th><th>理由</th></tr></thead>
          <tbody>
            {CHECKS.map((c) => (
              <tr key={c.n}><td><b>{c.n}</b></td><td>{c.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        SNSの募集で不安が残るのは、<strong>主催者の実績がどこにも記録されていないから</strong>です。
        過去に何回開いたか、参加した人がどう感じたかが見えないまま当日を迎えることになります。
      </p>
      <p>
        ゴルトモではラウンド後に参加者どうしが匿名で評価を残すため、
        <strong>次に募集を見る人が、その主催者の実績を確認できます。</strong>
        荒れにくいのは仕組みのおかげで、参加者の善意に頼っているわけではありません。
      </p>

      <h2 id="where">どこで募集を出す・探すか</h2>
      <div className="tbl">
        <table>
          <thead><tr><th>場所</th><th>費用</th><th>相手を選べるか</th><th>実績が見えるか</th></tr></thead>
          <tbody>
            <tr><td><b>SNS（X・Instagram）</b></td><td>無料</td><td>△ 反応待ち</td><td>× 見えない</td></tr>
            <tr><td><b>ゴルフ場の1人予約</b></td><td>プレー代のみ</td><td>× 選べない</td><td>× 見えない</td></tr>
            <tr><td><b>ゴルフサークル</b></td><td>年会費〜</td><td>○ 固定メンバー</td><td>○ 顔見知り</td></tr>
            <tr><td><b>マッチングサービス</b></td><td>無料〜</td><td>◎ 年代・腕前で指定</td><td>◎ レビューが残る</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>すぐ回りたいだけなら1人予約が最短</strong>です。
        ただし同伴者を選べず、その日限りで関係も残りません。
        <strong>同じ人とまた回りたいなら、実績が残る場所</strong>を選んでください。
      </p>

      <h2 id="data">実際どれくらい埋まるのか（運用データ）</h2>
      <p>
        「募集を出しても集まらないのでは」が、一番の心配だと思います。
        運用中のゴルトモの数字をそのまま出します。
      </p>
      {(showFill || showAgain) ? (
        <div className="data">
          <div className="dt">⛳ ゴルトモの実績（{today} 時点）</div>
          <div className="dg">
            {showFill && (
              <div className="dc">
                <div className="dv">{s.fillRate}%</div>
                <div className="dl">募集が満員になった割合</div>
                <div className="dn">n={s.fillN}件</div>
              </div>
            )}
            {showAgain && (
              <div className="dc">
                <div className="dv">{s.againRate}%</div>
                <div className="dl">また回りたいと答えた割合</div>
                <div className="dn">n={s.againN}件</div>
              </div>
            )}
            {s.totalPlayers > 0 && (
              <div className="dc">
                <div className="dv">{s.totalPlayers}人</div>
                <div className="dl">のべ参加人数</div>
                <div className="dn">同じ人の重複を含む</div>
              </div>
            )}
            {s.openCount > 0 && (
              <div className="dc">
                <div className="dv">{s.openCount}件</div>
                <div className="dl">いま募集中</div>
                <div className="dn">リアルタイム</div>
              </div>
            )}
          </div>
          <div className="note">
            ※ 満員率は、募集期間が終わった枠のうち定員に達したものの割合です。
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
        <h2>ラウンド募集を見てみる</h2>
        <p>
          20〜30代限定。募集を出すことも、一人で参加することもできます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_recruit" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_recruit">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">ゴルフ友達探しの方法を比較</span>
        </a>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">一人参加の実際と、当日の流れ</span>
        </a>
        <a href="/guide/golf-20s">
          <span className="l">20代のゴルフの始め方</span>
          <span className="n">費用・道具・一緒に回る人</span>
        </a>
        <a href="/guide/golf-30s">
          <span className="l">30代からのゴルフ</span>
          <span className="n">仕事で必要になった人と、趣味の人へ</span>
        </a>
      </div>
    </ArticleShell>
  );
}
