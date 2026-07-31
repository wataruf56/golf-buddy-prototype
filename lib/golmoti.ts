// ゴルフ性格診断「GOLMOTI」16タイプの共有データ（新軸版）。
// 軸：目的(G/E) × 社交(W/M) × 持ち味 飛距離P/技巧K × 向上心(T/I)。
// public/golmoti-chars/{code}.png に各タイプの動物キャラ画像がある。
// 出典は public/golmoti.html の NICK 定義と一致させること。

export type GolmotiType = {
  code: string;   // 例: 'GWPT'
  emoji: string;  // 動物の絵文字（フォールバック表示用）
  name: string;   // 「〜派」名
  animal: string; // 動物名
};

export const GOLMOTI_TYPES: GolmotiType[] = [
  { code: 'GWPT', emoji: '🐯', name: 'ぶっ飛ばしエース派', animal: 'トラ' },
  { code: 'GWPI', emoji: '🦁', name: '一発ロマン砲派', animal: 'ライオン' },
  { code: 'GWKT', emoji: '🐶', name: 'みんなで堅実・上達派', animal: 'イヌ' },
  { code: 'GWKI', emoji: '🦊', name: '賢く立ち回り派', animal: 'キツネ' },
  { code: 'GMPT', emoji: '🦅', name: '孤高の飛ばし屋派', animal: 'ワシ' },
  { code: 'GMPI', emoji: '🐆', name: '一撃必殺ハンター派', animal: 'ヒョウ' },
  { code: 'GMKT', emoji: '🐢', name: 'コツコツ精密派', animal: 'カメ' },
  { code: 'GMKI', emoji: '🦉', name: '黙々マイゴルフ派', animal: 'フクロウ' },
  { code: 'EWPT', emoji: '🐬', name: '楽しく伸びる飛ばし派', animal: 'イルカ' },
  { code: 'EWPI', emoji: '🐵', name: 'ノリ全開ドカン派', animal: 'サル' },
  { code: 'EWKT', emoji: '🦫', name: 'みんなでコツコツ派', animal: 'ビーバー' },
  { code: 'EWKI', emoji: '🐻', name: 'スコアより笑顔派', animal: 'クマ' },
  { code: 'EMPT', emoji: '🐺', name: '自由きまま飛ばし派', animal: 'オオカミ' },
  { code: 'EMPI', emoji: '🐱', name: '気分で大胆ショット派', animal: 'ネコ' },
  { code: 'EMKT', emoji: '🐹', name: 'コツコツ自分磨き派', animal: 'ハムスター' },
  { code: 'EMKI', emoji: '🦥', name: 'のんびりフェアウェイ散歩派', animal: 'ナマケモノ' },
];

const BY_CODE: Record<string, GolmotiType> = Object.fromEntries(
  GOLMOTI_TYPES.map((t) => [t.code, t])
);

export function getGolmotiType(code?: string | null): GolmotiType | undefined {
  if (!code) return undefined;
  return BY_CODE[code.toUpperCase().trim()];
}

// 各タイプの動物キャラ画像URL（透過PNG）。
export function golmotiImg(code: string): string {
  return `/golmoti-chars/${code}.png`;
}

// 診断ページ（共有結果／自分の結果）の URL。コード指定で結果を直接開ける。
export function golmotiUrl(code?: string): string {
  return code ? `/golmoti?type=${encodeURIComponent(code)}` : '/golmoti';
}

// ---------------------------------------------------------------------------
// 各タイプの詳細テキスト。/type/[code] の個別ページと診断LPの本文で使う。
// 出典は public/golmoti.html の DETAIL 定義（内容を一致させること）。
// ---------------------------------------------------------------------------

export type GolmotiDetail = {
  tagline: string;   // 一行キャッチ
  desc: string;      // 全体の説明
  strength: string;  // 強み
  weakness: string;  // 弱み
  aruaru: string;    // あるある
  osusume: string;   // おすすめの回り方
  tip: string;       // 上達のヒント
};

export const GOLMOTI_DETAILS: Record<string, GolmotiDetail> = {
  GWPT: {
    tagline: '飛距離で魅せてチームを引っ張る本気屋',
    desc: '結果にこだわる本気派で、豪快な飛距離で攻めるパワー型。仲間とワイワイ盛り上がるのが大好きで、自然とその場の主役になります。「もっと上手くなりたい」という向上心も人一倍で、練習も本番も全力で楽しむタイプ。あなたが一打を放てば、その日のラウンドは一気に盛り上がります。',
    strength: '誰よりも飛ぶドライバーと、場を一気に盛り上げるムードメーカー力。チームを引っ張る存在感で、初対面でもすぐ打ち解けられます。',
    weakness: '熱くなって攻めすぎ、ここ一番で大叩きしてしまうことも。力みと「もう一発」の欲はほどほどに。',
    aruaru: '「ナイショ！」の声が一番大きい。ドライバーの飛距離はつい盛りがち。',
    osusume: 'コンペやチーム戦で主役に。飛ばし屋同士で競い合うと、燃えて一番輝きます。',
    tip: '飛距離は最大の武器。ここぞで刻む勇気を持てると、スコアも一気に安定します。',
  },
  GWPI: {
    tagline: '飛距離とノリで魅せる、その場全力の主役',
    desc: '当たれば爆発する飛距離と、その場のノリを全力で楽しむロマン砲タイプ。スコアより「最高の一打」と盛り上がりを優先し、一緒にいると場がパッと明るくなります。安定感より一発の夢を追う、愛されムードメーカーです。',
    strength: '当たれば誰も真似できない特大ショットと、宴を盛り上げる番長気質。ノリの良さは天下一品。',
    weakness: 'ムラっ気が大きく、安定感は二の次。良い時と悪い時の差が激しめ。',
    aruaru: 'ドラコン（ドラコン賞）だけは何があっても獲りにいく。',
    osusume: 'ワイワイ系イベントやエンジョイコンペで、飛ばし自慢を披露するのが一番楽しい。',
    tip: '一発のロマンはそのままに、刻むホールを1〜2個決めておくと大崩れを防げます。',
  },
  GWKT: {
    tagline: '仲間と楽しみつつ着実に積み上げる相棒',
    desc: '仲間と楽しみながらも、技と安定で着実にスコアをまとめる頼れる相棒タイプ。面倒見がよく気配り上手で、グループの潤滑油的な存在。コツコツ努力を続けて、しっかり上達していく堅実派です。',
    strength: '大崩れしない安定感と、抜群の面倒見の良さ。チーム全体のスコアもまとめあげます。',
    weakness: '周りに気を配りすぎて、自分のプレーが後回しになりがち。',
    aruaru: '気づけば幹事を任されている。みんなの飲み物まで把握している。',
    osusume: '気の合う仲間との定期グループラウンドで、安定の実力を発揮できます。',
    tip: 'たまには自分のスコアにも本気を。あなたが攻めると周りももっと盛り上がります。',
  },
  GWKI: {
    tagline: '小技と機転で楽しく結果も拾う知恵袋',
    desc: 'コースマネジメントと機転で、無理せず結果を拾う知恵袋タイプ。場の空気を読むのが得意で、仲間と楽しみつつスマートに好スコアを出します。派手さより賢さで魅せる立ち回り上手です。',
    strength: '状況判断とコースマネジメント力。小技と機転で、危ない場面もそつなく切り抜けます。',
    weakness: 'そつがない分、内に秘めた熱量が周りに伝わりにくいことも。',
    aruaru: '大叩きせず、気づけばいつの間にか好スコア。',
    osusume: '仲間との気楽なコンペで、堅実な実力を発揮するのが向いています。',
    tip: 'たまに思い切って攻めると、新しい引き出しと飛距離が見つかります。',
  },
  GMPT: {
    tagline: '黙々と高みを狙う飛距離特化の求道者',
    desc: '飛距離への探究心が強く、黙々と高みを目指す求道者タイプ。一人の時間で技術を磨き、記録更新に喜びを感じます。群れずに自分と向き合う、ストイックな飛ばし屋です。',
    strength: '飛距離への飽くなき探究心と高い集中力。一人で淡々と上達を積み重ねられます。',
    weakness: '自分の世界に入り込みやすく、周りが見えなくなることも。',
    aruaru: '練習場で延々とドライバーを打ち込んでいる。',
    osusume: '少人数で記録更新を狙う、落ち着いたラウンドが性に合います。',
    tip: 'たまに気の合う仲間と回ると、研究の成果を試せて刺激になります。',
  },
  GMPI: {
    tagline: '静かに狙い、ハマれば爆発する勝負師',
    desc: '静かに狙い、ハマれば爆発する勝負師タイプ。決め所での一発の飛距離は格別で、自分のペースを崩さず攻めます。寡黙ながら一打にロマンを込める一匹狼です。',
    strength: '瞬発力と、ここぞでの一発の飛距離。決まった時の爆発力は誰にも負けません。',
    weakness: '気分の波が大きく、調子にムラが出やすい。',
    aruaru: '会心の一打を一日中語っていられる。',
    osusume: '自分のペースで攻められる、縛りの少ないラウンドで本領発揮。',
    tip: '波を小さくする「いつもの一本」を決めておくと、安定感が増します。',
  },
  GMKT: {
    tagline: 'ブレずに刻んで積み上げる堅実な努力家',
    desc: 'ブレずに刻んで積み上げる、堅実な努力家タイプ。派手さはないけれど大崩れせず、地道な継続でしっかり上達します。一人でも黙々と練習を重ねる、コツコツ精密派です。',
    strength: '大崩れしない安定感と、地道に続ける継続力。スコアメイクが手堅い。',
    weakness: '慎重すぎて、攻めるべき場面を逃してしまうことも。',
    aruaru: 'パター練習が何より好き。スコアは細かく記録している。',
    osusume: 'スコア管理をしながら、一人または少人数で回るのが向いています。',
    tip: 'リスクを取る練習も少しだけ。攻めの引き出しが増えると伸びしろ大。',
  },
  GMKI: {
    tagline: '自分の型を貫く寡黙な職人',
    desc: '自分の型を静かに貫く寡黙な職人タイプ。周りに流されず、淡々と良いスコアを出します。マイペースに自分のゴルフを味わう、落ち着いた一匹狼です。',
    strength: '自分のリズムを崩さない、ブレない安定感。一人でも淡々と good score。',
    weakness: 'マイペースすぎて、周りと温度差が生まれることも。',
    aruaru: '無言で淡々と、気づけば好スコアを出している。',
    osusume: '静かに集中して回れる、落ち着いた少人数ラウンドで。',
    tip: '同じく静かに楽しむ仲間を見つけると、心地よい距離感で長く続けられます。',
  },
  EWPT: {
    tagline: '笑顔で飛ばし、楽しみながら上達する伸び盛り',
    desc: '明るさと成長意欲を両立する伸び盛りタイプ。「楽しい！」を原動力に、仲間とワイワイ回りながらぐんぐん上達します。前向きなエネルギーで、周りまで元気にする存在です。',
    strength: '明るさと成長意欲の両立。楽しみながら自然と上達していく伸びしろの塊。',
    weakness: '楽しさ優先で、ここ一番の詰めが甘くなることも。',
    aruaru: '上達もスコアも、最後は「楽しかった！」で片付く。',
    osusume: 'ワイワイ仲間とのラウンド＆練習で、楽しく伸びていけます。',
    tip: '楽しさはそのままに、たまに1ホールだけ本気で集中すると一気に伸びます。',
  },
  EWPI: {
    tagline: 'ノリと勢いで振り回す陽気なムードメーカー',
    desc: 'ノリと勢いで振り回す、陽気なムードメーカータイプ。スコアより楽しさ最優先で、失敗すらネタにして笑いに変えます。一緒にいるだけで場が明るくなる、みんなの太陽です。',
    strength: '場を明るくする天性の力と、思い切りの良いスイング。',
    weakness: '大叩きしても気にしない（良くも悪くも）。安定感は二の次。',
    aruaru: '池ポチャもOBも、全部ネタにして大笑い。',
    osusume: '気楽なエンジョイコンペで、盛り上げ役として輝きます。',
    tip: '勢いはあなたの魅力。狙いどころだけ少し丁寧にすると、スコアもついてきます。',
  },
  EWKT: {
    tagline: '仲間と和気あいあい、着実に上手くなる働き者',
    desc: '仲間と和気あいあい、着実に上手くなる働き者タイプ。協調性が高く、コツコツ続ける継続力が持ち味。みんなで楽しみながら成長していく、和やかな相棒です。',
    strength: 'コツコツ続ける継続力と、抜群の協調性。場の雰囲気を和ませます。',
    weakness: 'のんびりしていて、ここ一番の決定力に欠けることも。',
    aruaru: 'みんなのボール探しを、率先して手伝っている。',
    osusume: '初心者歓迎の和やかなラウンドで、楽しく着実に上達できます。',
    tip: 'たまに自分の挑戦目標を決めると、続けてきた努力が一気に花開きます。',
  },
  EWKI: {
    tagline: 'スコアより笑顔、みんなで楽しむ宴会部長',
    desc: 'スコアより笑顔、みんなで楽しむことを大切にする宴会部長タイプ。包容力抜群で、場づくりの天才。勝ち負けより「みんなが楽しめたか」を一番に考える、愛されキャラです。',
    strength: '楽しい場づくりの才能と、誰でも受け入れる包容力。',
    weakness: '上達への本気度はやや控えめ。スコアにはこだわらない。',
    aruaru: '打ち上げの仕切りは任せろ。お店選びもプロ級。',
    osusume: 'イベントやコンペの幹事役で、いちばん輝くタイプです。',
    tip: 'たまに「今日はスコアも狙う日」を作ると、新鮮な達成感が味わえます。',
  },
  EMPT: {
    tagline: '一匹狼で気ままに飛ばし、こっそり上達する',
    desc: '群れずに気ままに飛ばし、こっそり上達するマイペース探究タイプ。自分の時間を大切にしながら、飛距離と技術を静かに磨きます。自由を愛する、伸びしろのある一匹狼です。',
    strength: 'マイペースな探究心と、伸びていく飛距離。自分のペースで着実に成長。',
    weakness: '群れるのが苦手で、誘いに乗りにくいことも。',
    aruaru: '一人予約で、ふらっと回りに行くのが好き。',
    osusume: '少人数の気楽なラウンドで、のびのび攻められます。',
    tip: 'たまに気の合う相手と回ると、ひとりでは気づけない発見があります。',
  },
  EMPI: {
    tagline: '気分屋だけど一打は大胆な自由人',
    desc: '気分屋だけど一打は大胆な自由人タイプ。乗った日は爽快なショットを連発し、自分の気分を何より大切にします。型にはまらず、その日のノリでゴルフを楽しむマイペース派です。',
    strength: 'ハマった時の大胆さと、爽快な一打。気分が乗ると手がつけられません。',
    weakness: '気分次第でムラが大きい。調子の波がそのままスコアに出る。',
    aruaru: '乗らない日は、さっさと切り上げる潔さ。',
    osusume: '縛りのない自由なラウンドで、気分よく回るのが一番。',
    tip: '気分を上げる「ルーティン」を持つと、調子の悪い日も底上げできます。',
  },
  EMKT: {
    tagline: 'マイペースに安全に腕を磨くがんばり屋',
    desc: 'マイペースに、安全に腕を磨くがんばり屋タイプ。控えめだけど努力家で、実はこっそり一番練習しているタイプ。自分のリズムで着実に積み上げる、堅実な努力家です。',
    strength: '地道な努力と、崩れない安定感。気づけば確実に上達しています。',
    weakness: '控えめで、自分からはなかなか誘いにくい。',
    aruaru: '実は練習量がこっそり一番多い。努力は人に見せない。',
    osusume: 'お互いのマイペースを尊重し合える仲間と、長く続けられます。',
    tip: '勇気を出して一度誘ってみると、気の合う仲間がきっと見つかります。',
  },
  EMKI: {
    tagline: '自然体でゴルフそのものを味わう癒し系',
    desc: '自然体でゴルフそのものを味わう癒し系タイプ。スコアや上達より、景色や空気、ゆったりした時間を楽しみます。動じない穏やかさで、一緒にいる人をふっと和ませる存在です。',
    strength: '動じない穏やかさで、その場の空気をやわらげる癒し力。',
    weakness: '向上心は薄めで、現状維持になりがち。',
    aruaru: '景色とお弁当（昼食）が、ラウンドの一番の楽しみ。',
    osusume: 'のんびり回れる、ゆるめの募集がぴったりです。',
    tip: 'たまに小さな目標を一つ持つと、いつものラウンドがもっと楽しくなります。',
  },
};

export function getGolmotiDetail(code?: string | null): GolmotiDetail | undefined {
  if (!code) return undefined;
  return GOLMOTI_DETAILS[code.toUpperCase().trim()];
}

// ---------------------------------------------------------------------------
// 4つの軸。コードの1〜4文字目がそれぞれ 目的 / 社交 / 持ち味 / 向上心 に対応。
// ---------------------------------------------------------------------------

export type Pole = { letter: string; label: string; emoji: string; desc: string; tag: string };
export type Axis = { key: string; title: string; left: Pole; right: Pole };

export const GOLMOTI_AXES: Axis[] = [
  {
    key: 'purpose', title: '目的',
    left:  { letter: 'G', label: 'ガチ',     emoji: '🔥', desc: '結果にこだわる本気派', tag: '#ガチ' },
    right: { letter: 'E', label: 'エンジョイ', emoji: '😎', desc: '楽しさ優先のエンジョイ派', tag: '#エンジョイ' },
  },
  {
    key: 'social', title: '社交',
    left:  { letter: 'W', label: 'ワイワイ',   emoji: '🎉', desc: '仲間とワイワイ回るのが好き', tag: '#社交的' },
    right: { letter: 'M', label: 'マイペース', emoji: '🧘', desc: '自分のペースを大切にする', tag: '#マイペース' },
  },
  {
    key: 'style', title: '持ち味',
    left:  { letter: 'P', label: '飛距離', emoji: '🚀', desc: '飛距離で攻めるパワー型', tag: '#飛距離' },
    right: { letter: 'K', label: '技巧',   emoji: '🎯', desc: '小技と正確性の技巧型', tag: '#技巧' },
  },
  {
    key: 'growth', title: '向上心',
    left:  { letter: 'T', label: '探求',   emoji: '📈', desc: 'もっと上手くなりたい探求心', tag: '#向上心' },
    right: { letter: 'I', label: '今満喫', emoji: '🌴', desc: '今この一打を味わう', tag: '#今を楽しむ' },
  },
];

// コードの各文字が該当する極（Pole）を、軸の順に返す。
export function polesOf(code: string): Pole[] {
  return GOLMOTI_AXES.map((ax, i) =>
    ax.left.letter === code[i] ? ax.left : ax.right
  );
}

// 「ガチ・ワイワイ・飛距離・探求」のような軸ラベルの並び。
export function axisLabels(code: string): string[] {
  return polesOf(code).map((p) => p.label);
}

function flip(code: string, axisIndex: number): string {
  const ax = GOLMOTI_AXES[axisIndex];
  const next = code[axisIndex] === ax.left.letter ? ax.right.letter : ax.left.letter;
  return code.slice(0, axisIndex) + next + code.slice(axisIndex + 1);
}

// ◎ ものすごく相性がいい：社交軸だけ逆＝価値観・プレースタイルが近く、社交性を補い合う。
export function matchGood(code: string): string { return flip(code, 1); }
// ○ 相性がいい：持ち味の軸だけ逆＝目的・社交・向上心が同じで、飛距離派×技巧派が補い合う。
export function matchOk(code: string): string { return flip(code, 2); }
