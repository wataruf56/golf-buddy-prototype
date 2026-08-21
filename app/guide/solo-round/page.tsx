import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { StartButton } from '@/components/StartButton';
import { getGuideStats, hasFillData, hasAgainData } from '@/lib/guideStats';

// 「ゴルフ 一人参加」「ゴルフ 一人で行く」狙いの記事。
//
// この語で検索する人の本当の不安は「浮かないか」「迷惑をかけないか」であって、
// 予約の取り方ではない。一般論のページはそこに触れないので、当日の流れを
// 分単位で書き、実際の年齢層・男女比を出して「どんな人が来るか」を先に見せる。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/solo-round`;
const TITLE = '一人でゴルフに行くには｜1人予約と一人参加の違い・当日の流れ';
const DESC =
  '一人でゴルフに行く方法を、1人予約と「一人参加OKの募集」に分けて比較します。受付から解散までの当日の流れ、初対面で浮かないための振る舞い、実際にどんな年齢層の人が来るのかを運用データつきで解説します。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 一人参加', 'ゴルフ 一人で行く', '1人予約 ゴルフ', 'ゴルフ ひとりラウンド',
    'ゴルフ 一人 恥ずかしい', 'ゴルフ 一人参加 マナー', 'ラウンド 一人',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: '一人でゴルフに行くには｜1人予約と一人参加の違い・当日の流れ',
    description: '1人予約と一人参加の募集を比較。当日の流れと、浮かないための振る舞いを解説します。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

const WAYS = [
  {
    n: '1人予約（じゃらん・楽天GORA等）', cost: 'プレー費のみ', pre: '× 分からない',
    after: '× その日限り',
    note: 'ゴルフ場が空き枠に一人客を組み合わせる仕組みです。手軽ですが、同伴者が誰かは当日まで分かりません。年齢もレベルもばらばらで、シニアの常連組に一人だけ混ざる形になることもあります。',
  },
  {
    n: '一人参加OKの募集に申し込む', cost: 'プレー費のみ', pre: '◎ 事前に分かる',
    after: '◎ 続けられる',
    note: '募集を出した人がいて、そこに申し込む形です。誰が主催で何人集まっているか、どんな条件かが事前に見えます。終わったあとも連絡が取れるので、合えばまた回れます。',
  },
  {
    n: 'ゴルフ場に直接ひとりで予約', cost: 'プレー費のみ', pre: '—',
    after: '× つながらない',
    note: '受け付けているコースは限られます。空いている平日なら通ることもありますが、土日はまず難しいと考えてください。',
  },
];

const FAQ = [
  {
    q: '一人でゴルフに行くのは恥ずかしくないですか？',
    a: '実際に行ってみると、一人参加はまったく珍しくありません。1人予約の枠は常に埋まっていますし、一人参加OKの募集にはそもそも一人で来る人しかいません。むしろ「一人で来ている人同士」なので気を使う相手がいない、という声の方が多いです。',
  },
  {
    q: 'スコアが悪くても参加できますか？',
    a: 'できます。ただし申し込むときに正直に書いてください。150と書いてある人が150で回るのは誰も気にしませんが、100と書いた人が150で回ると進行が崩れます。問題になるのはスコアそのものではなく、事前の申告と違うことです。',
  },
  {
    q: '一人参加だと組む相手は選べますか？',
    a: '1人予約は選べません。一人参加OKの募集なら、主催者や参加者のプロフィール・評価を見てから申し込めます。',
  },
  {
    q: '当日はどれくらい前に着けばいいですか？',
    a: '30分前を目安にしてください。受付・着替え・支払い方法の確認で15分ほどかかります。初対面の人と会う場合、慌てて着くと最初の印象が悪くなります。',
  },
  {
    q: '道具は全部そろっていないとだめですか？',
    a: 'クラブ・シューズ・グローブ・ボールがあれば回れます。レンタルクラブを置いているコースも多いので、事前に確認しておけば手ぶらに近い状態でも参加できます。',
  },
  {
    q: '一人参加でも運転できないと厳しいですか？',
    a: '送迎（ピックアップ）の調整ができる募集を選べば、車がなくても参加できます。詳しくは車がなくてもゴルフに行く方法の記事にまとめています。',
  },
];

export default async function Page() {
  const s = await getGuideStats();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: TITLE, description: DESC, mainEntityOfPage: PAGE_URL, inLanguage: 'ja',
      author: { '@type': 'Organization', name: 'ゴルトモ', url: `${SITE}/` },
      publisher: { '@type': 'Organization', name: '合同会社シクミヤ', url: `${SITE}/` },
      image: `${SITE}/ogp-golmoti.png`,
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <ArticleShell current="/guide/solo-round" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>一人でゴルフに行くには<br />1人予約と一人参加の違い</h1>
      <p className="lead">
        一人でゴルフに行く方法は大きく2つあります。この記事では両者の違いと、
        <strong>受付から解散までの当日の流れ</strong>、そして
        「浮かないか」「迷惑をかけないか」という不安への具体的な答えをまとめます。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#ways">一人で行く方法は2つ</a></li>
          <li><a href="#who">実際にどんな人が来るのか</a></li>
          <li><a href="#day">当日の流れ（受付から解散まで）</a></li>
          <li><a href="#manner">浮かないための3つの振る舞い</a></li>
          <li><a href="#ng">やってはいけないこと</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="ways">一人で行く方法は2つ</h2>
      <p>
        「1人予約」と「一人参加OKの募集」は、似ているようで<strong>決定的に違う点が1つ</strong>あります。
        <strong>同伴者が事前に分かるかどうか</strong>です。
      </p>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>方法</th><th>費用</th><th>相手が事前に分かるか</th><th>また会えるか</th>
            </tr>
          </thead>
          <tbody>
            {WAYS.map((w) => (
              <tr key={w.n}>
                <td><b>{w.n}</b></td><td>{w.cost}</td><td>{w.pre}</td><td>{w.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {WAYS.map((w) => (
        <div key={w.n}>
          <h3>{w.n}</h3>
          <p>{w.note}</p>
        </div>
      ))}
      <div className="callout">
        ⛳ <b>使い分けの目安</b><br />
        今週末どうしても回りたいだけなら1人予約が早い。
        <b>「一緒に回る人を見つけたい」なら、事前に相手が分かる募集型</b>を選んでください。
        1人予約は関係が続かないので、毎回ゼロからやり直しになります。
      </div>

      <h2 id="who">実際にどんな人が来るのか</h2>
      <p>
        一人参加でいちばん多い不安が「自分より上手い人ばかりだったらどうしよう」「年齢が離れていたら気まずい」です。
        一般論では答えようがないので、<strong>実際に運用しているサービスの数字</strong>を出します。
      </p>
      {hasFillData(s) ? (
        <>
          <div className="data">
            <div className="dt">⛳ ゴルトモの実績（{today}時点）</div>
            <div className="dg">
              {s.avgAge != null && (
                <div className="dc">
                  <div className="dv">{s.avgAge}歳</div>
                  <div className="dl">参加者の平均年齢</div>
                  <div className="dn">20〜30代限定</div>
                </div>
              )}
              {s.femaleRate != null && (
                <div className="dc">
                  <div className="dv">{100 - s.femaleRate}:{s.femaleRate}</div>
                  <div className="dl">男女比</div>
                  <div className="dn">男性{100 - s.femaleRate}% ／ 女性{s.femaleRate}%</div>
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
            </div>
            <div className="note">
              ※ サービス内の実データを自動集計しています。母数も併記しているので、
              数字の確からしさはご自身で判断できます。
            </div>
          </div>
          <p>
            平均{s.avgAge ?? 30}歳前後という数字が意味するのは、
            <strong>一人参加の場は「同世代が集まる場」になりやすい</strong>ということです。
            1人予約でシニアの常連組に一人混ざる状況とは、前提がかなり違います。
          </p>
        </>
      ) : (
        <p>
          集計に足りる件数が貯まり次第、参加者の平均年齢・男女比・満員率をここに公開します。
        </p>
      )}

      <h2 id="day">当日の流れ（受付から解散まで）</h2>
      <p>初めてだと分からないのは「何時に何をするのか」です。実際の流れはこうなります。</p>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>時間</th><th>やること</th><th>ポイント</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>スタート60分前</b></td><td>ゴルフ場に到着・クラブを預ける</td>
              <td>初対面なら余裕を持ちたい時間帯</td>
            </tr>
            <tr>
              <td><b>50分前</b></td><td>フロントで受付・ロッカーの鍵を受け取る</td>
              <td>名前を伝えるだけ。組の代表者名を聞かれることがある</td>
            </tr>
            <tr>
              <td><b>40分前</b></td><td>着替え・同伴者と合流</td>
              <td className="ok">ここで挨拶。<b>最初の一言で空気が決まる</b></td>
            </tr>
            <tr>
              <td><b>20分前</b></td><td>練習場かパター練習</td><td>体を動かしながら会話ができる</td>
            </tr>
            <tr>
              <td><b>10分前</b></td><td>スタート地点へ移動</td><td>遅れると組全体に迷惑がかかる</td>
            </tr>
            <tr>
              <td><b>前半9ホール</b></td><td>約2時間15分</td><td>最初の3ホールは緊張するのが普通</td>
            </tr>
            <tr>
              <td><b>昼食</b></td><td>約1時間</td><td className="ok">いちばん会話が進む時間</td>
            </tr>
            <tr>
              <td><b>後半9ホール</b></td><td>約2時間15分</td><td>ここまで来ると打ち解けている</td>
            </tr>
            <tr>
              <td><b>終了後</b></td><td>風呂・精算・解散</td><td>連絡先の交換はここで</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>所要は朝から夕方までのほぼ丸一日</strong>です。
        スタートが7時台なら5時起き、解散は17時前後になります。
        初回は「思ったより長い」と感じる人が多いので、翌日に予定を詰めないでおくと安心です。
      </p>

      <h2 id="manner">浮かないための3つの振る舞い</h2>
      <h3>1. スコアは正直に申告する</h3>
      <p>
        繰り返しますが、これが最も大事です。
        <strong>下手なことは問題になりません。申告と違うことが問題になります</strong>。
        150で回るつもりなら150と書いてください。それを承知で受け入れてくれる募集にだけ参加すればいいのです。
      </p>
      <h3>2. 30分前に着く</h3>
      <p>
        遅刻はスコア以上に印象を左右します。逆に言えば、<strong>早く着くだけで信頼は稼げます</strong>。
        初対面の人にとって、あなたの実力はまだ分かりませんが、時間を守るかどうかはその日に分かります。
      </p>
      <h3>3. 人のプレーを褒める</h3>
      <p>
        自分のスコアを気にするより、同伴者のナイスショットに反応する方がずっと効きます。
        ゴルフは待ち時間が長い競技なので、<strong>その時間に何を言うか</strong>で印象が決まります。
        話題に困ったら「普段どこで練習してるんですか」で十分もちます。
      </p>

      <h2 id="ng">やってはいけないこと</h2>
      <div className="callout">
        🙅 <b>当日キャンセル</b>／ゴルフ場の予約は人数で押さえてあるため、
        欠員が出ると残った人が費用をかぶることがあります。一人参加の場で最も嫌われる行為です。<br />
        🙅 <b>スロープレー</b>／ボールが見つからないときは早めに諦める。上手い下手より進行です。<br />
        🙅 <b>人のスイングへの助言</b>／頼まれていないアドバイスは、良かれと思っても嫌がられます。
      </div>
      <p>
        逆に言えば、<strong>この3つを避けるだけで「また誘いたい人」になれます</strong>。
        技術ではないので、初日からできます。
      </p>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>一人で参加できる募集を見る</h2>
        <p>
          20〜30代限定。申し込みは1タップで、誰かを誘う必要はありません。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_solo_round" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_solo">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">関連する記事</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">費用・すぐ行けるか・気まずさで比較</span>
        </a>
        <a href="/guide/round-debut">
          <span className="l">ラウンドデビューの進め方</span>
          <span className="n">練習場からコースに出るまでの手順</span>
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
