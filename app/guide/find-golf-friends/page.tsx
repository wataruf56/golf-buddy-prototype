import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ友達 探す／作り方」で上位を狙う主力記事。
//
// 検索1位のページは約7,500字の一般論で、実データが1つも無い。
// こちらは運用中のアプリの実数（満員率・また回りたい率・年齢・男女比）を
// 根拠として出せるのが決定的な差になる。数字は毎回集計するので古くならない。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/find-golf-friends`;
const DESC =
  'ゴルフ友達がいなくてもラウンドに行く方法を7つ比較。職場・スクール・練習場・サークル・SNS・1人予約・マッチングを、費用/すぐ行けるか/気まずさで整理しました。実際の募集がどれくらい集まるかも運用データで公開します。';

export const metadata: Metadata = {
  title: 'ゴルフ友達の探し方7つ｜一人でもラウンドに行ける方法を実データで比較',
  description: DESC,
  keywords: [
    'ゴルフ友達 探す', 'ゴルフ友達 作り方', 'ゴルフ仲間 探し方', 'ゴル友 探し',
    'ゴルフ 一人参加', 'ラウンド募集', 'ゴルフ 友達 いない', 'ゴルフ マッチング',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルフ友達の探し方7つ｜一人でもラウンドに行ける方法',
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
];

export default async function Page() {
  const s = await getGuideStats();
  const showData = s.fillRate != null && s.fillN >= 3;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'ゴルフ友達の探し方7つ｜一人でもラウンドに行ける方法を実データで比較',
      description: DESC,
      mainEntityOfPage: PAGE_URL,
      inLanguage: 'ja',
      author: { '@type': 'Organization', name: 'ゴルトモ', url: `${SITE}/` },
      publisher: { '@type': 'Organization', name: '合同会社シクミヤ', url: `${SITE}/` },
      image: `${SITE}/ogp-golmoti.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  return (
    <ArticleShell current="/guide/find-golf-friends" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>ゴルフ友達の探し方7つ<br />一人でもラウンドに行ける方法</h1>
      <p className="lead">
        「ゴルフを始めたけれど、一緒に回る人がいない」。道具を揃えて練習場にも通っているのに、
        コースに出られない。この記事では、ゴルフ友達を見つける方法を7つ並べて、
        <strong>費用・すぐ行けるか・気まずさ</strong>で比較します。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#methods">探し方7つの比較</a></li>
          <li><a href="#data">実際どれくらい集まるのか（運用データ）</a></li>
          <li><a href="#awkward">一人参加で気まずくならないコツ</a></li>
          <li><a href="#car">車がない場合はどうするか</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="methods">ゴルフ友達の探し方7つを比較</h2>
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
