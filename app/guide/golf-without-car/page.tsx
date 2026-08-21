import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { StartButton } from '@/components/StartButton';
import { getGuideStats } from '@/lib/guideStats';

// 「ゴルフ 車なし」「ゴルフ 送迎」「ゴルフ 相乗り」狙いの記事。
//
// 都心の20〜30代は車を持っていない人が多く、これがゴルフを始めない最大の
// 物理的な理由になっている。にもかかわらず、この語を正面から扱った記事が少ない。
// 手段を3つに整理し、相乗りを頼むときの実務（費用の割り勘・言い方）まで書く。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/guide/golf-without-car`;
const TITLE = '車がなくてもゴルフに行く方法3つ｜送迎・電車バス・相乗り';
const DESC =
  '車を持っていなくてもゴルフに行けます。送迎（ピックアップ）・電車＋クラブハウスバス・相乗りの3つを、費用と手間で比較しました。相乗りを頼むときの割り勘の相場と、頼み方の文例もまとめています。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    'ゴルフ 車なし', 'ゴルフ 送迎', 'ゴルフ 相乗り', 'ゴルフ場 電車',
    'ゴルフ 車ない 行けない', 'ゴルフ ピックアップ', 'ゴルフ場 バス',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'article', url: PAGE_URL, siteName: 'ゴルトモ',
    title: '車がなくてもゴルフに行く方法3つ｜送迎・電車バス・相乗り',
    description: '送迎・電車＋バス・相乗りを費用と手間で比較。割り勘の相場と頼み方の文例つき。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

const WAYS = [
  {
    n: '① 送迎してもらう（ピックアップ）', cost: 'ガソリン代・高速代の割り勘', time: '◎ 最短',
    diff: '△ 頼める相手が要る',
    note: '同じ組の誰かが車を出し、駅などで拾ってもらう方法です。クラブを担いで電車に乗る必要がなく、朝の移動が最も楽になります。難点は「頼める相手がいるか」の一点に尽きます。',
  },
  {
    n: '② 電車＋クラブハウスバス', cost: '往復2,000〜4,000円', time: '△ 早起きが必要',
    diff: '◎ 誰にも頼まなくていい',
    note: '最寄り駅までクラブハウスバスを出しているコースがあります。誰にも頼らずに行けるのが最大の利点です。ただし本数が少なく、始発に近い電車になることが多くなります。',
  },
  {
    n: '③ タクシー（駅から）', cost: '2,000〜6,000円（片道）', time: '◎ 楽',
    diff: '◎ 誰にも頼まなくていい',
    note: '駅からコースまで直接向かう方法です。人数で割れば現実的な額になります。地方のコースだと台数が少ないので、帰りは事前に手配しておく必要があります。',
  },
];

const FAQ = [
  {
    q: '車がないとゴルフは無理ですか？',
    a: '無理ではありません。送迎してもらう、電車とクラブハウスバスを使う、駅からタクシーに乗るの3つの方法があります。都心の20〜30代は車を持っていない人が多いので、送迎を前提にした募集も珍しくありません。',
  },
  {
    q: 'クラブは電車で運べますか？',
    a: '運べますが、キャディバッグは重量10kg前後あり、混雑した電車ではかなり負担です。宅配便でコースに前もって送る方法もあります（片道2,000円前後、3日前までに発送）。何度も行くなら送迎か相乗りを確保した方が現実的です。',
  },
  {
    q: '送迎してもらう場合、いくら払えばいいですか？',
    a: 'ガソリン代と高速代を人数で割った額が目安です。都心から1時間半のコースなら、1人あたり1,500〜2,500円程度になります。金額を言い出しにくい場合は、昼食や飲み物を出すという形でも構いません。',
  },
  {
    q: '相乗りはどうやって頼めばいいですか？',
    a: '募集に申し込むときに「車がないので、可能なら駅で拾っていただけると助かります」と先に書いてください。当日になってから言うのが最もよくありません。事前に分かっていれば、主催者は集合場所を調整できます。',
  },
  {
    q: 'クラブハウスバスがあるコースはどう探せばいいですか？',
    a: 'コースの公式サイトに「クラブバス」「送迎バス」の記載があります。予約サイトの検索条件で絞り込めることもあります。関東なら中央線・東武東上線・京成線の沿線に、駅からバスを出しているコースが比較的多くあります。',
  },
  {
    q: '帰りはお酒を飲めますか？',
    a: '送迎してもらう場合、運転する人は当然飲めません。自分が乗せてもらう立場なら、風呂上がりの1杯を頼む前に一言確認してください。相乗りの場では、全員が飲まないという選択が無難です。',
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
    <ArticleShell current="/guide/golf-without-car" page="guide">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>車がなくてもゴルフに行く方法<br />送迎・電車バス・相乗り</h1>
      <p className="lead">
        都心で暮らす20〜30代がゴルフを始めない理由として、
        腕前より先に来るのが<strong>「車がない」</strong>です。
        しかしこれは、方法を知っていれば越えられます。手段は3つあります。
      </p>
      <p className="meta">最終更新：{today}</p>

      <div className="toc">
        <div className="t">この記事の内容</div>
        <ol>
          <li><a href="#ways">3つの方法を比較</a></li>
          <li><a href="#pickup">送迎を頼むときの実務</a></li>
          <li><a href="#bus">電車＋クラブハウスバスで行く</a></li>
          <li><a href="#clubs">クラブをどう運ぶか</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="ways">3つの方法を比較</h2>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>方法</th><th>費用</th><th>朝の楽さ</th><th>頼みやすさ</th></tr>
          </thead>
          <tbody>
            {WAYS.map((w) => (
              <tr key={w.n}>
                <td><b>{w.n}</b></td><td>{w.cost}</td><td>{w.time}</td><td>{w.diff}</td>
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
        🚗 <b>結論</b><br />
        続けるつもりなら<b>①の送迎を確保するのが圧倒的に楽</b>です。
        ②③は「頼める相手がまだいない段階」のつなぎと考えてください。
        逆に言えば、車を出せる人と知り合うことが、車なしでゴルフを続ける最短の道です。
      </div>

      <h2 id="pickup">送迎を頼むときの実務</h2>
      <p>
        送迎は「頼みにくい」と感じる人が多いのですが、
        <strong>先に言っておけば、たいていの場合は問題になりません</strong>。
        揉めるのはいつも「当日になって言い出す」ケースです。
      </p>
      <h3>いつ言うか</h3>
      <p>
        <strong>申し込むときです。</strong>
        主催者は集合場所とスタート時刻から逆算して動くので、
        あとから経路が変わると全員の起床時間に影響します。
      </p>
      <h3>いくら払うか</h3>
      <p>
        ガソリン代と高速代を人数で割った額が目安です。
        都心から1時間半のコースで、<strong>1人あたり1,500〜2,500円程度</strong>になります。
        金額を切り出しにくければ、昼食や道中の飲み物を持つ形でも成立します。
        大事なのは金額そのものより、<strong>払う意思を先に示すこと</strong>です。
      </p>
      <h3>言い方の例</h3>
      <div className="callout">
        💬 「参加させてください。車を持っていないので、
        もし可能でしたら○○駅あたりで拾っていただけると助かります。
        ガソリン代と高速代は人数で割ってお支払いします。
        難しければ電車で向かいますので、遠慮なくおっしゃってください。」
      </div>
      <p>
        最後の一文があるかどうかで、相手の受け取り方はかなり変わります。
        断る余地を残しておくと、頼まれた側も答えやすくなります。
      </p>
      <p>
        なお、ゴルトモでは<strong>この調整をサービスの中で完結</strong>させています。
        主催者が拾える駅をあらかじめ登録し、参加者は申し込み時に希望を答えるだけです。
        LINEで何往復もやり取りする必要はありません。
      </p>

      <h2 id="bus">電車＋クラブハウスバスで行く</h2>
      <p>
        誰にも頼まずに行きたいなら、この方法になります。
        コースの公式サイトに「クラブバス」「送迎バス」として時刻が載っています。
      </p>
      <h3>気をつける点</h3>
      <p>
        <strong>本数が非常に少ない</strong>のが最大の注意点です。
        朝は1〜2本、帰りも数本しかないことが多く、乗り遅れると次が1時間後になります。
        スタート時刻から逆算して、<strong>1本前のバスに乗る</strong>くらいの余裕を見てください。
      </p>
      <p>
        また、平日は運行するが土日は運休、あるいはその逆というコースもあります。
        必ず<strong>行く曜日の時刻表</strong>を確認してください。
      </p>

      <h2 id="clubs">クラブをどう運ぶか</h2>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>方法</th><th>費用</th><th>向いている場面</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>車に積んでもらう</b></td><td className="ok">0円</td>
              <td>送迎・相乗りができるとき</td>
            </tr>
            <tr>
              <td><b>宅配便でコースに送る</b></td><td>片道2,000円前後</td>
              <td>電車で行くとき。3日前までに発送</td>
            </tr>
            <tr>
              <td><b>自分で担いで電車</b></td><td className="ok">0円</td>
              <td>短距離・空いている時間帯のみ</td>
            </tr>
            <tr>
              <td><b>レンタルクラブ</b></td><td>2,000〜4,000円</td>
              <td>回数が少ないうち。手ぶらで行ける</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        キャディバッグは<strong>10kg前後</strong>あります。
        朝の混雑した電車で担ぐのは現実的ではないので、
        電車で行くなら宅配便かレンタルを前提に考えてください。
        「毎回レンタルでいい」と割り切ってしまうのも、始めたばかりの時期には合理的です。
      </p>

      <h2 id="faq">よくある質問</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <div className="cta">
        <h2>送迎つきの募集を探す</h2>
        <p>
          主催者が拾える駅を登録しているので、車がなくても参加できます。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件です。</>}
        </p>
        <a className="btn" href="https://app.goltomo.com/links/rounds?ref=guide_no_car" data-lp="guide_rounds">
          ⛳ いまの募集を見てみる
        </a>
        <span className="sub">登録なしで中身を見られます</span>
        <StartButton className="sub2" lp="cta_guide_no_car">💬 LINEではじめる（無料・約30秒）</StartButton>
      </div>

      <div className="rel">
        <div className="t">関連する記事</div>
        <a href="/guide/solo-round">
          <span className="l">一人でゴルフに行くには</span>
          <span className="n">1人予約と一人参加の違い・当日の流れ</span>
        </a>
        <a href="/guide/round-debut">
          <span className="l">ラウンドデビューの進め方</span>
          <span className="n">いつ・誰と・いくらで行くか</span>
        </a>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">費用・すぐ行けるか・気まずさで比較</span>
        </a>
        <a href="/about">
          <span className="l">ゴルトモとは</span>
          <span className="n">20〜30代限定のゴルフ友達マッチング</span>
        </a>
      </div>
    </ArticleShell>
  );
}
