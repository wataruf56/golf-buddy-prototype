import type { Metadata } from 'next';
import { ArticleShell } from '@/components/site/ArticleShell';
import { computeLpStats, EMPTY_LP_STATS, type LpStats } from '@/lib/lpStats';

// 「ゴルトモとは」。サイト内リンクの起点であり、ブランド名で検索した人の受け皿。
//
// 「ゴルトモ」「ゴル友」はどちらも無関係の別サービス（練習場・アカデミー）が
// 上位を取っている。ブランド名で検索した人が確実にここへ着くよう、名前の説明と
// サービスの中身を1ページにまとめ、Organization/WebApplication の構造化データで
// 「これが公式である」ことを機械にも伝える。
export const dynamic = 'force-dynamic';

const SITE = 'https://goltomo.com';
const PAGE_URL = `${SITE}/about`;
const DESC =
  'ゴルトモは、20〜30代限定のゴルフ友達マッチングサービスです。LINEだけで使えてアプリのダウンロードは不要、利用は無料。一人で参加できるラウンド募集と、ラウンド後の相互レビューで「知らない人と回る不安」を減らします。';

export const metadata: Metadata = {
  title: 'ゴルトモとは｜20〜30代のゴルフ友達マッチング（無料・LINEだけ）',
  description: DESC,
  keywords: [
    'ゴルトモ', 'ゴルトモとは', 'ゴル友', 'ゴルフ友達 マッチング', 'ゴルフ マッチングアプリ',
    'ゴルフ 友達 作る', 'ラウンド募集 アプリ', 'ゴルフ 一人参加 アプリ',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website', url: PAGE_URL, siteName: 'ゴルトモ',
    title: 'ゴルトモとは｜20〜30代のゴルフ友達マッチング',
    description: 'LINEだけで使える、20〜30代限定のゴルフ友達マッチング。無料・アプリDL不要。',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

async function getStats(): Promise<LpStats & { openCount: number }> {
  let stats: LpStats = { ...EMPTY_LP_STATS };
  let openCount = 0;
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) stats = await computeLpStats(adb);
  } catch { /* 数字が出せなくてもページは表示する */ }
  try {
    const { db } = await import('@/lib/db');
    const open = await db.listRounds({ status: 'open' });
    openCount = open.filter((r: any) => !String(r.hostId || '').startsWith('test_')).length;
  } catch { /* noop */ }
  return { ...stats, openCount };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'ゴルトモは無料ですか？',
    a: '無料です。会員登録も、募集への参加も、ラウンド相手を探すことも費用はかかりません。かかるのはゴルフ場に支払うプレー費だけです。',
  },
  {
    q: 'アプリのダウンロードは必要ですか？',
    a: '不要です。LINEの中でそのまま開きます。ホーム画面にアイコンが増えることもありません。',
  },
  {
    q: '一人でも参加できますか？',
    a: 'ほとんどの人が一人参加です。募集への申し込みは1タップで、誰かを誘ってから参加する必要はありません。',
  },
  {
    q: '知らない人と回るのが不安です。',
    a: 'ラウンド後にお互いを評価する仕組みがあります。マナーの良い人が★として可視化されるので、初対面でも判断材料があります。ドタキャンの報告も受け付けています。',
  },
  {
    q: '初心者でも大丈夫ですか？',
    a: '募集ごとに「初心者歓迎」などの条件が書かれています。スコアを正直に書いておけば、それを承知の上で受け入れてくれる募集にだけ参加することになります。',
  },
  {
    q: '車を持っていなくても参加できますか？',
    a: 'できます。送迎（ピックアップ）の調整がサービスの中で完結します。主催者は拾える駅を登録し、参加者は申し込み時に希望を答えるだけです。',
  },
  {
    q: '年齢の制限はありますか？',
    a: '20〜30代限定のコミュニティです。世代を合わせることで、費用感やプレーのペース、話題のずれが起きにくくなります。',
  },
];

export default async function AboutPage() {
  const s = await getStats();
  const showData = s.fillRate != null && s.fillN >= 3;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${SITE}/#app`,
        name: 'ゴルトモ',
        alternateName: ['ゴル友', 'Goltomo'],
        url: SITE,
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'LINE (iOS / Android / Web)',
        description: DESC,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
        ...(s.againRate != null && s.againN >= 20
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: (Math.round((s.againRate / 20) * 10) / 10).toFixed(1),
                bestRating: '5', ratingCount: String(s.againN),
              },
            }
          : {}),
      },
      {
        '@type': 'FAQPage',
        '@id': `${PAGE_URL}#faq`,
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'ゴルトモとは', item: PAGE_URL },
        ],
      },
    ],
  };

  return (
    <ArticleShell current="/about">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <h1>ゴルトモとは</h1>
      <p className="lead">
        20〜30代限定の、ゴルフ友達マッチングです。LINEだけで使えて、利用は無料。
        「行きたいけど、誘う相手がいない」を無くすために作りました。
      </p>
      <div className="meta">最終更新：{new Date().toLocaleDateString('ja-JP')}</div>

      <div className="toc">
        <div className="t">このページの内容</div>
        <ol>
          <li><a href="#what">ひとことで言うと</a></li>
          <li><a href="#name">「ゴルトモ」という名前について</a></li>
          <li><a href="#how">使い方（3ステップ）</a></li>
          <li><a href="#why">ほかの方法と何が違うのか</a></li>
          <li><a href="#safe">知らない人と回る不安について</a></li>
          <li><a href="#data">実際のデータ</a></li>
          <li><a href="#faq">よくある質問</a></li>
        </ol>
      </div>

      <h2 id="what">ひとことで言うと</h2>
      <p>
        <strong>一人で申し込めるラウンド募集の掲示板</strong>です。
        誰かが「この日、この辺りで回ります」と募集を出し、それを見た人が1タップで参加を申し込みます。
        集まったメンバーで当日ラウンドし、終わったらお互いを評価します。
      </p>
      <p>
        ゴルフは4人1組が基本なので、一人だと予約すら取りづらい競技です。
        かといって毎回3人を集めるのは現実的ではありません。
        <strong>その「あと1〜3人」を埋めるための場所</strong>だと考えてください。
      </p>

      <div className="callout">
        ⛳ LINEの中で完結します。アプリのダウンロードも、新しいIDとパスワードも要りません。<br />
        💰 利用は無料です。かかるのはゴルフ場のプレー費だけです。
      </div>

      <h2 id="name">「ゴルトモ」という名前について</h2>
      <p>
        <strong>ゴルフ＋友達（トモ）</strong>で「ゴルトモ」です。サービス内では、
        一緒に回って「また回りたい」と思えた相手のことを<strong>ゴル友</strong>と呼んでいます。
      </p>
      <p>
        検索すると、名前の似た別のサービス（ゴルフ練習場やレッスンのスクールなど）が出てくることがあります。
        それらとは運営も内容も関係ありません。このサイト（goltomo.com）が公式です。
      </p>

      <h2 id="how">使い方（3ステップ）</h2>
      <h3>1. LINEで登録する（約30秒）</h3>
      <p>
        LINEのログインを1回通すだけです。年齢・エリア・だいたいのスコアを入れておくと、
        条件の合う募集が見つけやすくなります。
      </p>
      <h3>2. 募集を探す、または自分で出す</h3>
      <p>
        参加したいだけなら、募集一覧から気になるものに申し込むだけです。
        自分で募集を出す場合、<strong>ゴルフ場が決まっていなくても構いません</strong>。
        「この日、この辺りで」だけでも募集は成立します。
      </p>
      <h3>3. 回って、評価する</h3>
      <p>
        当日は普通にラウンドするだけです。終わったらお互いを評価します。
        この評価が次に回る人の判断材料になり、場の質を保っています。
      </p>

      <h2 id="why">ほかの方法と何が違うのか</h2>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>方法</th><th>費用</th><th>すぐ行けるか</th><th>関係が続くか</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>ゴルトモ</b></td><td className="ok">無料</td><td className="ok">◎ 募集があればすぐ</td>
              <td>評価が残るので、合った人とまた回れる</td>
            </tr>
            <tr>
              <td>ゴルフスクール</td><td>月1〜2万円</td><td className="ng">× 数ヶ月</td>
              <td>上達もできるが、友達づくりとしては高くつく</td>
            </tr>
            <tr>
              <td>1人予約（じゃらん等）</td><td>プレー費のみ</td><td>◎ すぐ</td>
              <td>その日限り。関係は続きにくい</td>
            </tr>
            <tr>
              <td>ゴルフサークル</td><td>年会費〜</td><td>△ 入会後</td>
              <td>顔ぶれは固定。合わないと抜けづらい</td>
            </tr>
            <tr>
              <td>SNSで募集</td><td>無料</td><td>△ 反応次第</td>
              <td>相手の素性が分からない</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <a href="/guide/find-golf-friends">7つの方法をもっと詳しく比較した記事</a>も書いています。
      </p>

      <h2 id="safe">知らない人と回る不安について</h2>
      <p>
        いちばん多い不安が「変な人が来たらどうするのか」です。これに対しては、
        <strong>ラウンド後の相互評価</strong>で答えを出しています。
      </p>
      <p>
        評価は★として残り、次に誰かが申し込みを判断するときに見えます。
        雑な振る舞いをする人は自然と参加しづらくなる仕組みです。
        ドタキャンについても報告を受け付けており、繰り返す人は運営側で対応します。
      </p>
      <p>
        また、ゴルトモが主催するコンペでは<strong>男女比とグループ分けを調整</strong>しています。
        女性が1組に1人きりにならないようにしているので、初めてでも参加しやすいはずです。
      </p>

      <h2 id="data">実際のデータ</h2>
      {showData ? (
        <>
          <div className="data">
            <div className="dt">⛳ ゴルトモの実績（{new Date().toLocaleDateString('ja-JP')}時点）</div>
            <div className="dg">
              <div className="dc">
                <div className="dv">{s.fillRate}%</div>
                <div className="dl">募集が満員に</div>
                <div className="dn">完了した{s.fillN}件の平均充足率</div>
              </div>
              {s.againRate != null && (
                <div className="dc">
                  <div className="dv">{s.againRate}%</div>
                  <div className="dl">また回りたい</div>
                  <div className="dn">一緒に回った後の評価{s.againN}件</div>
                </div>
              )}
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
            </div>
            <div className="note">
              ※ サービス内の実データを自動で集計しています。母数も一緒に出しているので、
              数字がどれくらい確かなのかはご自身で判断できます。
            </div>
          </div>
          <p>
            ここから読み取れるのは、<strong>募集を出せばたいてい人は集まる</strong>ということです。
            参加する側から見れば、申し込める募集が常にあるということでもあります。
          </p>
        </>
      ) : (
        <p>
          集計に足りる件数が貯まり次第、満員率・「また回りたい」率・平均年齢・男女比をここに公開します。
          数字は毎回自動で計算するので、古いまま放置されることはありません。
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
        <h2>ゴルフ友達を見つけにいく</h2>
        <p>
          登録は無料・約30秒。合わなければ使うのをやめるだけです。
          {s.openCount > 0 && <><br />いま募集中のラウンドは{s.openCount}件あります。</>}
        </p>
        <a className="btn" href="/app?ref=about" data-lp="cta_about" data-lp-goal="1">
          ⛳ LINEではじめる（無料）
        </a>
        <a className="sub" href="https://app.goltomo.com/links/rounds" data-lp="rounds_about"
          style={{ color: '#FBF3E0' }}>
          👀 先に募集だけ見る（登録不要）
        </a>
      </div>

      <div className="rel">
        <div className="t">続けて読む</div>
        <a href="/guide/find-golf-friends">
          <span className="l">ゴルフ友達の探し方7つ</span>
          <span className="n">費用・すぐ行けるか・気まずさで比較</span>
        </a>
        <a href="/golmoti.html">
          <span className="l">ゴルフ版MBTI・16タイプ診断</span>
          <span className="n">自分がどんなゴルファーか30秒で分かる（無料）</span>
        </a>
      </div>
    </ArticleShell>
  );
}
