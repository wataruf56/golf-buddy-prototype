import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { articleJsonLd, displayDate } from '@/lib/articleMeta';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ友達 探す／作り方」で上位を狙う主力記事。
//
// 【2026-10-10 ユーザー指示で狙いを3語に固定】「ゴルフ友達」「ゴルフ友達探し」「ゴルフ仲間がいない」。
// Google の検索結果を見ると、この3語は上位の顔ぶれがほぼ同じ（探し方の解説記事・知恵袋・
// サークル系）＝Google は同じ悩みとして扱っている。ページを分けると自社どうしで食い合うので、
// この1本に集める。「ゴルフ仲間がいない」は title に「いなくて」としか無く、完全一致が
// 無かったので 70位だった。title / h1 / 見出しに完全一致で入れてある。消さないこと。
//
// 検索1位のページは約7,500字の一般論で、実データが1つも無い。
// こちらは運用中のアプリの実数（満員率・また回りたい率・年齢・男女比）を
// 根拠として出せるのが決定的な差になる。数字は毎回集計するので古くならない。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/find-golf-friends`;
const TITLE = 'ゴルフ友達探しの方法7つ｜ゴルフ仲間がいない人が一人でもラウンドに行くまで';
const DESC =
  'ゴルフ仲間がいない人向けに、ゴルフ友達探しの方法を7つ比較。職場・スクール・練習場・サークル・SNS・1人予約・マッチングを、費用/すぐ行けるか/気まずさで整理し、無料でできる方法と今週から動く順番もまとめました。実際の募集がどれくらい集まるかも運用データで公開します。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 友達探し', 'ゴルフ友達探し', 'ゴルフ友達 探す', 'ゴルフ友達 作り方',
    'ゴルフ仲間 探し方', 'ゴル友 探し', 'ゴルフ 20代', 'ゴルフ 30代',
    'ゴルフ 一人参加', 'ラウンド募集', 'ゴルフ 友達 いない', 'ゴルフ マッチング',
    'ゴルフ友達', 'ゴルフ仲間がいない', 'ゴルフ仲間 探し', 'ゴルフ 一緒に回る人 いない',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルフ友達探しの方法7つ｜ゴルフ仲間がいない人へ',
    description: '7つの方法を費用・すぐ行けるか・気まずさで比較。実際の運用データも公開。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};


const METHODS = [
  {
    n: '職場・友人のつて', cost: '—', speed: '△ 相手次第', awk: '◎ 低い',
    fit: 'すでに周りにゴルフをやる人がいる',
    note: '最も気楽ですが、相手の予定と腕前に左右されます。毎回こちらから誘うことになると、だんだん気を使うようになります。',
  },
  {
    n: 'ゴルフスクール', cost: '月1〜2万円', speed: '× 数ヶ月', awk: '◎ 低い',
    fit: '上達も一緒に狙いたい',
    note: '同じクラスの人と自然に仲良くなれます。ただし友達づくりだけが目的なら、費用と時間に対して効率は良くありません。',
  },
  {
    n: '練習場で知り合う', cost: '打席代のみ', speed: '× 運次第', awk: '△ 声かけが要る',
    fit: '同じ場所に通い続けられる人',
    note: '通っていれば顔見知りはできます。ただし「一緒に回りませんか」と言える関係になるまでには、かなり時間がかかります。',
  },
  {
    n: 'ゴルフサークル', cost: '年会費〜', speed: '△ 入会後', awk: '△ 既存の輪がある',
    fit: '同じ人たちと継続的に回りたい',
    note: '顔ぶれが固定される安心感があります。一方で、雰囲気が合わなかったときに抜けづらいという面もあります。',
  },
  {
    n: 'SNSで募集する', cost: '無料', speed: '△ 反応待ち', awk: '× 素性が分からない',
    fit: '発信するのが苦にならない人',
    note: 'ハッシュタグで探せますが、相手の実績が見えないため、当日まで不安が残ります。ドタキャンされても打つ手がありません。',
  },
  {
    n: 'ゴルフ場の1人予約', cost: 'プレー代のみ', speed: '◎ すぐ', awk: '△ 相手を選べない',
    fit: 'とにかく今すぐ回りたい',
    note: '確実にラウンドできるのが最大の利点です。ただし同伴者は選べず、年齢層も当日まで分かりません。',
  },
  {
    n: 'マッチングサービス', cost: '無料〜', speed: '◎ すぐ', awk: '○ 事前に分かる',
    fit: '年代や雰囲気を選んで回りたい',
    note: '相手のプロフィールや評価を見てから決められます。サービスによって年齢層が大きく違うので、そこだけ確認してください。',
  },
];

const FAQ = [
  {
    q: 'ゴルフ友達がいなくてもラウンドに行けますか？',
    a: '行けます。ゴルフ場の1人予約や、一人参加を前提にした募集を使えば、当日その場で合流して回れます。近年は一人で申し込む人向けの仕組みが増えています。',
  },
  {
    q: '初心者でも一人でラウンドに参加していいですか？',
    a: '「初心者歓迎」と書かれた募集を選べば問題ありません。スコアを正直に伝えておくと、当日の組み合わせを考えてもらえるので気まずくなりません。',
  },
  {
    q: '知らない人と回るのは気まずくないですか？',
    a: 'ラウンドは4〜5時間あるので、前半で自然と打ち解けることがほとんどです。相手の過去の評価が見えるサービスを選ぶと、事前の不安はかなり減ります。',
  },
  {
    q: '車がなくてもゴルフに行けますか？',
    a: '行けます。最寄り駅まで送迎してくれる募集を選ぶか、相乗りの調整ができるサービスを使う方法があります。',
  },
  {
    q: 'ゴルフをしたいけど、友達がいません。どうしたらいいですか？',
    a: '「友達を作ってから誘う」順番をやめて、「一人で申し込める場に出る」ほうが早く進みます。一人参加OKのラウンド募集やゴルフ場の1人予約なら、知り合いがゼロでも今月中にコースに出られます。一緒に回った人の中から、また回りたい人が残っていきます。',
  },
  {
    q: 'ゴルフの友達になれる無料アプリはありますか？',
    a: 'あります。ゴルフ仲間探しの機能を無料で使えるサービスは複数あり、ゴルトモも利用無料（LINEで使うのでアプリのダウンロードも不要）です。どのサービスでもラウンド代は別途かかるので、「月額＋ラウンド代」で比べてください。',
  },
  {
    q: 'ゴルフ仲間がいない初心者は、何から始めればいいですか？',
    a: '練習場で7番アイアンとドライバーがそこそこ当たるようになったら、「初心者歓迎」と書かれた募集に一人で申し込むのが近道です。スコアは正直に伝えてください。上達してから仲間を探すより、仲間と回りながら上達するほうが続きます。',
  },
];

// 本文を直したらこの日付を上げる。あわせて public/sitemap.xml の lastmod も同じ日に
// 揃えること（ページ表示・Article の dateModified・sitemap の3か所で同じ日を名乗る）。
const MODIFIED = '2026-10-10';

export default async function Page() {
  const s = await getGuideStats();
  const showData = s.fillRate != null && s.fillN >= 3;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');
  // 表示する更新日は MODIFIED（=dateModified・lastmod と同じ日）を使う。
  const updated = displayDate(MODIFIED);

  // 構造化データは lib/articleMeta.ts で共通化（日付・著者・publisher を必ず入れる）。
  const jsonLd = articleJsonLd(
    { path: '/guide/find-golf-friends', title: TITLE, description: DESC, published: '2026-08-21', modified: MODIFIED },
    FAQ,
  );

  return (
    <ArticleShell current="/guide/find-golf-friends" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ゴルフ友達探しの方法7つ<br />ゴルフ仲間がいない人が、一人でもラウンドに行くまで</h1>
      <p className="lead">
        「ゴルフを始めたけれど、<strong>ゴルフ仲間がいない</strong>」。道具を揃えて練習場にも通っているのに、
        一緒に回る人がいなくてコースに出られない。この記事では、<strong>ゴルフ友達探し</strong>の方法を7つ並べて、
        <strong>費用・すぐ行けるか・気まずさ</strong>で比較し、今週から動く順番までまとめます。
      </p>
      <p className="meta">最終更新：{updated}</p>

      {/* 結論を先に出す。AIに引用されるための箱でもある。 */}
      <div className="answer">
        <span className="at">結論</span>
        <p>
          <b>ゴルフ友達の探し方は主に7つ</b>——職場のつて／ゴルフスクール／練習場/ゴルフサークル／SNSで募集／
              1人予約／マッチングサービス。<b>「今すぐ回りたい」なら1人予約かマッチング、「長く付き合える人を作りたい」なら
              スクールかマッチング</b>です。1人予約は手軽ですがその日限りで関係が続きません。
              判断の軸は<b>費用・すぐ行けるか・気まずさ・関係が続くか</b>の4つです。
        </p>
      </div>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#why">ゴルフ仲間がいないのは、なぜか</a></li>
          <li><a href="#methods">探し方7つの比較</a></li>
          <li><a href="#free">無料でできるゴルフ友達探し</a></li>
          <li><a href="#steps">ゴルフ仲間がいない人が動く順番</a></li>
          <li><a href="#women">女性がゴルフ友達を探すとき</a></li>
          <li><a href="#data">実際どれくらい集まるのか（運用データ）</a></li>
          <li><a href="#awkward">一人参加で気まずくならないコツ</a></li>
          <li><a href="#car">車がない場合はどうするか</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="why">ゴルフ仲間がいないのは、あなたのせいではない</h2>
      <p>
        ゴルフ友達ができにくいのには、ゴルフという競技そのものの理由があります。
        自分に原因を探す前に、構造を知っておくと動き方が決まります。
      </p>
      <h3>4人そろわないと始まらない</h3>
      <p>
        テニスなら2人、ランニングなら1人で始められます。ゴルフは<strong>基本が4人1組</strong>で、
        しかも5〜6時間を一緒に過ごします。「ちょっと一緒にやろう」と気軽に誘える単位ではないので、
        誘う側にも誘われる側にもハードルが生まれます。
      </p>
      <h3>予定を合わせるのが難しい</h3>
      <p>
        ラウンドは早朝スタートの丸一日がかりで、予約は2〜4週間前に埋まります。
        4人の休みを1か月先で揃える調整は、友達同士でも面倒です。
        ゴルフをやる知り合いがいても、<strong>「予定が合わない」で流れ続ける</strong>のはよくあることです。
      </p>
      <h3>腕前と予算の差が気になる</h3>
      <p>
        初心者は「迷惑をかけるのでは」と遠慮し、上手な人は「付き合わせるのも悪い」と遠慮します。
        プレー代も1回7,000〜15,000円と軽くないので、金銭感覚の違う相手とは続きません。
        ゴルフ仲間がいない人の多くは、<strong>相手がいないのではなく、ちょうどいい相手に出会う場が無い</strong>だけです。
      </p>

      <h2 id="methods">ゴルフ友達探し・ゴルフ仲間の見つけ方7つを比較</h2>
      <p>
        どれが正解ということはありません。
        <strong>「今すぐ回りたい」のか「長く付き合える人を作りたい」のか</strong>で向き不向きが変わります。
        まず一覧で見比べてください。
      </p>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>方法</th><th>費用</th><th>すぐ行けるか</th><th>気まずさ</th><th>向いている人</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.n}>
                <td><b>{m.n}</b></td>
                <td>{m.cost}</td>
                <td>{m.speed}</td>
                <td>{m.awk}</td>
                <td>{m.fit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {METHODS.map((m, i) => (
        <div key={m.n}>
          <h3>{i + 1}. {m.n}</h3>
          <p>{m.note}</p>
        </div>
      ))}

      <h2 id="free">無料でできるゴルフ友達探し</h2>
      <p>
        ゴルフはただでさえお金がかかるので、友達探しにまで費用をかけたくない人は多いはずです。
        7つのうち、<strong>探すこと自体にお金がかからない</strong>のは次の4つです（ラウンド代はどれも別途かかります）。
      </p>
      <div className="tbl">
        <table>
          <thead><tr><th>方法</th><th>無料でできること</th><th>気をつけること</th></tr></thead>
          <tbody>
            <tr><td><b>職場・友人のつて</b></td><td>声をかけるだけ</td><td>相手の予定に左右される</td></tr>
            <tr><td><b>SNSで募集する</b></td><td>ハッシュタグで募集・応募</td><td>相手の実績が見えない</td></tr>
            <tr><td><b>ゴルフ場の1人予約</b></td><td>登録・予約は無料</td><td>その日限りで関係が続きにくい</td></tr>
            <tr><td><b>無料のマッチングサービス</b></td><td>プロフィール登録・募集への参加</td><td>年齢層と、有料機能の有無を確認</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        スクールとサークルは費用がかかるぶん、顔ぶれが固定されて関係が続きやすいという利点があります。
        <strong>まず無料の方法でコースに出て、続けたくなったら有料の場を足す</strong>という順番なら、
        お金をかけて合わなかったという失敗を避けられます。
      </p>

      <h2 id="steps">ゴルフ仲間がいない人が、今週から動く順番</h2>
      <p>
        方法を知っても、動かなければゴルフ友達はできません。
        知り合いゼロの状態から、無理なく一緒に回る人を増やしていく順番を書いておきます。
      </p>
      <h3>今週：一人で申し込める募集を3つ見る</h3>
      <p>
        いきなり申し込まなくてかまいません。「初心者歓迎」「一人参加OK」の募集が、
        いつ・どこで・どんな年代で出ているかを眺めるだけで、行けそうな日程と場所の相場が分かります。
      </p>
      <h3>今月：1回だけ一人で参加する</h3>
      <p>
        1回目は「楽しかったかどうか」より「行けたかどうか」が大事です。
        集合場所・受付・スタートまでの流れを一度経験すると、2回目からの緊張がまったく違います。
      </p>
      <h3>3か月：また回りたい人に、自分から声をかける</h3>
      <p>
        何回か回ると、「この人とはまた回りたい」という相手が1人か2人は出てきます。
        その人を次の募集に誘う、あるいはその人の募集に入る。
        <strong>ゴルフ仲間は、1回で作るものではなく、回った回数の中から残っていくもの</strong>です。
      </p>

      <h2 id="women">女性がゴルフ友達を探すとき</h2>
      <p>
        女性の場合は「周りにゴルフをする女性がいない」「男性ばかりの組に一人で入るのは不安」という悩みがつきものです。
        女性がゴルフ仲間を探すときは、次の3点を見ておくと安心です。
      </p>
      <p>
        <strong>① 恋愛目的のサービスと分ける</strong>……「ゴルフ×出会い」を前面に出しているものは、
        一緒に回る相手探しとは目的が違います。ゴルフ仲間がほしいだけなら、そうでないものを選んでください。<br />
        <strong>② 参加者の男女構成が事前に分かるか</strong>……申し込む前に、その組に女性が何人いるかが見えると、
        当日の不安がかなり減ります。<br />
        <strong>③ 送迎は相手を確認してから</strong>……車に乗せてもらう場合は、ラウンド後の評価が残っている相手か、
        複数人で乗り合わせる形にすると安心です。
      </p>

      <h2 id="data">実際どれくらい集まるのか（運用データ）</h2>
      <p>
        「募集しても集まらないのでは」「変な人が来たらどうしよう」。
        ここが一番の不安だと思います。一般論ではなく、
        20〜30代限定で運用しているゴルトモの<strong>実際の数字</strong>を出します。
      </p>

      {showData ? (
        <div className="data">
          <div className="dt">📊 ゴルトモの実績（{today} 時点）</div>
          <div className="dg">
            <div className="dc">
              <div className="dv">{s.fillRate}%</div>
              <div className="dl">募集が満員に</div>
              <div className="dn">完了した{s.fillN}件の平均充足率</div>
            </div>
            {s.againRate != null && s.againN >= 20 && (
              <div className="dc">
                <div className="dv">{s.againRate}%</div>
                <div className="dl">また回りたい</div>
                <div className="dn">一緒に回った後の評価{s.againN}件</div>
              </div>
            )}
            {s.avgAge != null && s.ageN >= 20 && (
              <div className="dc">
                <div className="dv">{s.avgAge}歳</div>
                <div className="dl">参加者の平均年齢</div>
                <div className="dn">20〜30代限定</div>
              </div>
            )}
            {s.femaleRate != null && s.genderN >= 20 && (
              <div className="dc">
                <div className="dv">{100 - s.femaleRate}:{s.femaleRate}</div>
                <div className="dl">男女比</div>
                <div className="dn">男性{100 - s.femaleRate}% ／ 女性{s.femaleRate}%</div>
              </div>
            )}
          </div>
          <div className="note">
            ※ アプリ内の実データを自動集計しています。母数も併記しているので、
            数字の確からしさはご自身で判断できます。
          </div>
        </div>
      ) : (
        <p>（集計データの準備中です）</p>
      )}

      <p>
        ここから読み取れるのは<strong>「募集を出せば、たいてい人は集まる」</strong>ということです。
        一人で参加する側から見れば、<strong>参加できる募集は常にある</strong>ということでもあります。
      </p>
      <p>
        「変な人が来ないか」については、<strong>ラウンド後にお互いを評価する仕組み</strong>があるかどうかで
        大きく変わります。評価が残るサービスでは、雑な振る舞いをする人は自然と参加しづらくなります。
      </p>

      <h2 id="awkward">一人参加で気まずくならない3つのコツ</h2>
      <h3>スコアは正直に伝える</h3>
      <p>
        見栄を張って実力より良いスコアを申告すると、当日ついていけず本人が一番つらくなります。
        「120くらい」「ラウンド未経験」と正直に書いた方が、相手も組み合わせを考えやすく、結果的に楽しめます。
      </p>
      <h3>集合時間の30分前に着く</h3>
      <p>
        受付・着替え・練習グリーンで、自然に話す時間が生まれます。ぎりぎりに着くと、
        挨拶もそこそこにスタートすることになり、最後まで距離が縮まりません。
      </p>
      <h3>自分のプレーは淡々と、人のプレーは褒める</h3>
      <p>
        ミスをしても引きずらず、相手のナイスショットに反応する。これだけで印象は大きく変わります。
        4〜5時間あるので、前半で打ち解ければ後半は自然と会話が続きます。
      </p>

      <h2 id="car">車がない場合はどうするか</h2>
      <p>
        ゴルフ場は駅から遠いことが多く、車の有無が一番のハードルになります。方法は3つです。
      </p>
      <p>
        <strong>① 送迎してもらう</strong>……募集の主催者や参加者が最寄り駅まで迎えに来てくれるケースです。
        事前に「拾える駅」が決まっている募集を選ぶと確実です。
      </p>
      <p>
        <strong>② ゴルフ場の送迎バス</strong>……最寄り駅から出ている場合があります。
        ただし本数が少なく、スタート時間との調整が必要です。
      </p>
      <p>
        <strong>③ タクシーを相乗り</strong>……駅から近いコースなら、複数人で割れば現実的な金額に収まります。
      </p>
      <div className="callout">
        送迎の有無は募集を選ぶ段階で分かることが多いので、
        <strong>「送迎あり」で絞り込めるサービス</strong>を使うと探す手間が減ります。
      </div>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>一緒に回る人を探す</h2>
        <p>
          20〜30代限定。一人で参加して、また回りたい人を見つけられます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_friends" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_friends">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">あわせて読みたい</div>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">一人参加の実際と、当日の流れ</span>
        </a>
        <a href="/guide/round-recruit">
          <span className="l">ゴルフのラウンド募集</span>
          <span className="n">集まる募集の書き方と選び方</span>
        </a>
        <a href="/guide/golf-matching">
          <span className="l">ゴルフマッチングアプリの選び方</span>
          <span className="n">種類と、目的・年代・費用で比べる</span>
        </a>
        <a href="/guide/golf-20s">
          <span className="l">20代のゴルフの始め方</span>
          <span className="n">費用・道具・一緒に回る人</span>
        </a>
        <a href="/guide/golf-30s">
          <span className="l">30代からのゴルフ</span>
          <span className="n">仕事で必要になった人と、趣味の人へ</span>
        </a>
        <a href="/guide/round-debut">
          <span className="l">ラウンドデビューの進め方</span>
          <span className="n">初めてコースに出る人へ</span>
        </a>
        <a href="/guide/golf-without-car">
          <span className="l">車がなくてもゴルフに行く</span>
          <span className="n">送迎・相乗りの使い方</span>
        </a>
        <a href="/golmoti.html">
          <span className="l">ゴルフ版MBTI・16タイプ診断</span>
          <span className="n">自分がどんなゴルファーか知る（無料）</span>
        </a>
      </div>
    </ArticleShell>
  );
}
