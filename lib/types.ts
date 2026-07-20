export type Gender = 'male' | 'female' | 'other';
export type CarStatus = 'have' | 'none';

// 参加者ごとのピックアップ回答ステータス。
//   can     : 送迎可能（車あり）→ 送れる駅を入力
//   cannot  : 送迎不可（車あり）→ 駅入力なし
//   want    : ピックアップしてほしい（車なし）→ 希望する駅を入力
//   no_need : ピックアップ不要（車なし）→ 駅入力なし
export type PickupStatus = 'can' | 'cannot' | 'want' | 'no_need';

export type User = {
  id: string;
  displayName: string;
  age: number;
  gender?: Gender;
  car?: CarStatus;
  bio?: string;
  area: string;
  scoreRange: string;
  playStyle: string;
  frequency: string;
  // ゴルフ性格診断「GOLMOTI」の16タイプコード（例: 'GWST'）。未診断なら未設定。
  golmotiType?: string;
  avatar: string;
  avatarUrl?: string;
  // アイコンの種類: 'photo'=写真 / 'emoji'=絵文字(男女マーク) / 'golmoti'=診断アイコン。
  // 未設定なら avatarUrl があれば写真、無ければ絵文字（後方互換）。
  avatarMode?: 'photo' | 'emoji' | 'golmoti';
  color: string;
  lineId?: string;
  reviewAvg: number;
  reviewCount: number;
  roundCount: number;
  buddyCount: number;
  blockedUserIds?: string[];
  recentScores?: ScoreEntry[];
  notifyOff?: boolean;        // legacy master switch (true = all notifications off)
  // 公式LINEアカウントを友だち追加済みか。LIFF の liff.getFriendship() で取得し、
  // ログイン時に保存する。true=登録済み（ホームの「LINEで通知を受け取る」案内を出さない）。
  // undefined=未判定（友だち判定がLIFFで使えない環境）。
  botFollowed?: boolean;
  botFollowedAt?: number;     // 上記を最後に更新した時刻
  // Per-type notification preferences for the LINE official account + web push.
  // Keys are NotifyType (lib/notifyPrefs). Missing key → that type's default.
  notifyPrefs?: Record<string, boolean>;
  // 「お知らせ」(アプリ内通知インボックス) を最後に既読にした時刻。これより
  // 新しい createdAt の通知が未読扱い。
  notifReadAt?: number;
  golfHistory?: string;        // 「1年未満」「1年」…「5年以上」
  // 行ける曜日（平日 / 土日 / どちらも / シフト制）。プロフィールに表示。
  availableDays?: string;
  // Instagram のユーザー名（@なし）または URL。プロフィールに「Instagram」ボタンを出し、
  // タップで https://instagram.com/{username} を開く（アプリがあればアプリで開く）。
  instagram?: string;
  // QRコードで直接つながった友達のユーザーID（相互）。一緒に回っていなくても
  // 「ゴル友」タブに表示され、DMできる。友達API(/api/friends)でのみ更新される。
  friendIds?: string[];
  // 漢字フルネーム（ゴルフ場への届出用）。一般ユーザー・友だちには非公開で、
  // 参加/募集したラウンドの「募集者」にのみ表示される。API応答では本人以外には
  // ストリップされ、募集者へは /api/rounds/[id]/participant-names 経由でのみ渡る。
  realNameLast?: string;       // 名字（姓）
  realNameFirst?: string;      // 名前（名）
  // Per-month free swing analysis usage. Whitelisted users (isSwingAllowed)
  // bypass this counter entirely; everyone else gets SWING_FREE_LIMIT runs
  // per calendar month (default 1). Reset semantics live in lib/swingQuota.
  swingUsage?: { month: string; count: number; lifetimeCount?: number };
};

export type ScoreEntry = { score: number; date: string };

export type RoundType = 'confirmed' | 'flexible';
export type DateType = 'fixed' | 'range';
export type RoundStatus = 'open' | 'closed' | 'completed';

export type Round = {
  id: string;
  hostId: string;
  hostCohort?: 'a' | 'b';        // 'a' = 20s/30s, 'b' = 40s/50s. Stamped at creation time.
  title: string;
  type: RoundType;
  courseName?: string;
  area?: string;
  dateType: DateType;
  date?: string;
  dateRange?: string;
  startTime?: string;
  // maxSpots = 主催者(1) + 募集枠。つまり「自分を含めた合計人数」。
  maxSpots: number;
  // 募集枠（＝maxSpots-1）の性別内訳。未設定の旧データは「すべてどちらでもOK」とみなす。
  // spotsMale + spotsFemale + spotsAny = maxSpots - 1。
  spotsMale?: number;   // 男性の募集枠
  spotsFemale?: number; // 女性の募集枠
  spotsAny?: number;    // どちらでもOKの募集枠
  // 主催者の知り合い（ゴルトモ外で既に集まっている人）。主催者と同様に最初から
  // 枠を埋めている扱い（currentCount に算入）。男女別に保持。
  externalMale?: number;
  externalFemale?: number;
  externalCount?: number; // 旧データ互換（性別不明の合計）。新規は male+female を使用。
  currentCount: number;
  applicantIds: string[];
  pendingApplicantIds?: string[];
  price?: string;
  // 男女別料金（無料・割引プランなどで男女で参加費が異なる場合）。
  // priceMale と priceFemale の両方が入っているときだけ「男女別」が有効になり、
  // 閲覧者の性別に応じて出し分ける。未設定なら price（男女同額）を表示。
  priceMale?: string;
  priceFemale?: string;
  // Free-form display label kept for back-compat (mock data uses strings
  // like "初心者OK"). Auto-derived from beginnerOnly + genderCondition for
  // new rounds, used only for display.
  levelCondition: string;
  // True = "初心者のみ"; only scoreRange in BEGINNER_FRIENDLY_SCORES may
  // apply (see lib/roundEligibility). False/undefined = 誰でも・初心者OK.
  beginnerOnly?: boolean;
  // 'any' (default) = 男女どちらでも申込可。'male' = 男性のみ。'female' = 女性のみ。
  // Server-side gate enforced in /api/rounds/[id]/join.
  genderCondition?: 'any' | 'male' | 'female';
  description?: string;
  // 集合場所・集合時間などの詳細（自由記入）。日時のすぐ下に表示。
  meetingInfo?: string;
  status: RoundStatus;
  // ラウンドが完了(completed)になった時刻。再会エンジンのトリガー基準に使う。
  completedAt?: number;
  isCompetition: boolean;
  // True when the host is a ゴルトモ admin (set server-side at creation from
  // isAdminUserId — cannot be spoofed by the client). Official rounds render
  // with a dedicated icon + "ゴルトモ公式" name + badge.
  isOfficial?: boolean;
  createdAt: number;
  // Per-participant scores recorded after the round completes. Optional and
  // sparse — any participant may fill in their own or each other's score, and
  // saved entries are also mirrored into each user's recentScores list so
  // their profile updates automatically.
  scores?: Record<string, number>;
  // ms timestamp when the "レビューしてください" LINE push was sent for this
  // round. Used by /api/cron/round-reminders to avoid double-sending. Unset
  // = never sent.
  reviewReminderSentAt?: number;
  // Users who tapped the ♡「気になる」heart on this round. Publicly visible
  // (anyone can see who's interested). The host can invite people from here.
  interestedIds?: string[];
  // Users the host has invited to this round (ゴル友 or 気になる people).
  // Invited users get a LINE notification and see the round highlighted.
  invitedIds?: string[];
  // 招待時に主催者が添えた一言メッセージ。キー: 招待された userId → メッセージ。
  // 通知だけでなく、招待された本人がラウンドを開いたときに画面内でも表示する。
  inviteMessages?: Record<string, string>;
  // ms timestamp when the "締切間近" LINE push was sent to 気になる users.
  // Used by the interest-deadline reminder to avoid double-sending. Unset
  // = never sent.
  interestDeadlineSentAt?: number;
  // コンペの組分け（主催者が編集）。各組のスタート時間とメンバー。未割り当ての
  // 参加者はどの組にも入っていない人として扱う。
  groups?: RoundGroup[];
  // 主催者が自前のLINEオープンチャットを持っている場合のURL。設定されていれば
  // グループチャット上部に「LINEのオープンチャットあり」として表示。未設定なら非表示。
  openChatUrl?: string;
  // 主催者が車でピックアップ（送迎）できる代表駅（複数）。一般公開で表示し、
  // コンペ以外の募集ではカード上で目立たせる。
  pickupStations?: string[];
  // 主催者が送迎で乗せられる人数（運転者である自分を含む）。
  pickupCapacity?: number;
  // 主催者が送迎（ピックアップ）できるか。投稿時に「可/不可」を必須で選ぶ。
  // true=送迎できる（駅は任意・後から追加可）／false=送迎しない。未設定=旧データ。
  pickupOffered?: boolean;
  // 参加者ごとのピックアップ回答。userId → { status, stations, capacity }。
  //   status='can'  : 送れる駅 stations ＋ capacity(自分含む)
  //   status='want' : 希望する駅 stations
  //   status='cannot' / 'no_need' : stations なし（回答のみ記録）
  // 旧データ（status未設定で stations あり）は「送迎可能(can)」とみなす。
  participantPickups?: Record<string, { stations: string[]; capacity?: number; status?: PickupStatus }>;
  // 主催者が「配車（車の割り振り）」で組んだ、車ごとの乗車メンバー。組み分けと同じ
  // ドラッグ&ドロップで編集する。drivers＝送迎可能な人（主催者＋car=have回答者）、
  // passengerIds＝その車に乗せる希望者。
  carAssignments?: CarAssignment[];
  // 主催者から各参加者への「この駅でどう？」というピックアップ場所の提案。
  //   キー: 提案先のuserId → { station, by(主催者id), at }
  //   受け手が「OK」or「相談したい」を押す、または主催者が取り消すと null にする
  //   （Firestoreの merge 更新でキーを消せないため、クリアは null で表現する）。
  pickupProposals?: Record<string, PickupProposal | null>;
  // ゴルトモ未登録のゲスト参加者（主催者が名前で追加）。組み分けに入れられる。
  // RoundGroup.memberIds にはこの guest.id（"gst_..."）も入りうる。
  guests?: RoundGuest[];
  // 開催前リマインドの送信記録。キー: 'd30'|'d7'|'d1' → 送信時刻(ms)。二重送信防止。
  upcomingRemindersSent?: Record<string, number>;
  // この募集の元になった日程調整（調整さん）ポールのID。ポール→募集の順で作った場合に入る。
  schedulePollId?: string;
};

// ===== 「調整さん」風の日程調整（募集とは独立したポール） =====
// 募集を作る前に、候補日を出し合って ○△× で回答してもらい、日程を決める。
// URLを共有すれば、ゴルトモ未登録の人も登録して回答できる。決まった日程をもとに
// 「コース予約済み / コース未定」を選んで募集を投稿する（ポール→募集の順）。
//
// options / responses はどちらも配列（Firestore の merge:true は配列を丸ごと
// 置換するため、要素の削除・更新が安全に効く。map だと古いキーが残る）。

// 候補日ひとつ。参加メンバー誰でも追加できる（createdBy に追加者を記録）。
export type ScheduleOption = {
  id: string;          // 'sopt_...'
  date: string;        // 'YYYY-MM-DD' もしくは自由記入ラベル
  startTime?: string;  // スタート時間（任意）
  createdBy: string;   // 追加した userId
  createdAt: number;
};

// ○=参加できる / △=たぶん・調整可 / ×=不可
export type ScheduleAnswer = 'ok' | 'maybe' | 'no';

// 一人分の回答。answers は optionId → ○△×。
export type ScheduleResponse = {
  userId: string;
  answers: Record<string, ScheduleAnswer>;
  comment?: string;
  updatedAt: number;
};

export type SchedulePoll = {
  id: string;
  ownerId: string;     // ポールを作った人（＝これから募集を立てる人）
  title?: string;      // 任意のタイトル（例: 「7月の週末ゴルフ」）
  createdAt: number;
  options: ScheduleOption[];
  responses: ScheduleResponse[];
  // オーナーが決めた候補日。未決定は null/未設定。
  decidedOptionId?: string | null;
  decidedAt?: number;
  // このポールから作成された募集のID（募集を投稿すると入る）。
  roundId?: string;
};

// 配車の1台分。driverId＝運転者（主催者 or 送迎可能な参加者）、passengerIds＝
// その車に乗せる希望者、station＝集合/ピックアップ場所（任意）。
export type CarAssignment = {
  driverId: string;
  passengerIds: string[];
  station?: string;
};

// 主催者からのピックアップ場所の提案。
export type PickupProposal = {
  station: string;
  by: string;   // 提案した主催者のid
  at: number;   // 提案時刻(ms)
};

export type RoundGroup = {
  id: string;
  startTime?: string;
  memberIds: string[];
  course?: string;   // コース種別（例: 'IN-OUT' / 'OUT-IN' / 自由入力のコース名）
};

// ゴルトモ未登録のゲスト（名前のみ）。組み分けに含められる。
export type RoundGuest = {
  id: string;   // "gst_..." 形式
  name: string;
};

// ラウンド後の相手への判定。星評価は廃止し、この4択に。
//   again    : また回りたい / romantic : 異性として気になる（また回りたいを内包）
//   never    : 二度と回りたくない / either : どっちでもいい
export type ReviewVerdict = 'again' | 'romantic' | 'never' | 'either';

export type Review = {
  id: string;
  roundId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number;
  tags: string[];
  comment?: string;
  verdict?: ReviewVerdict;
  createdAt: number;
  isAnonymous: true;
};

export type PendingReview = {
  id: string;
  roundId: string;
  reviewerId: string;
  revieweeId: string;
  status: 'pending' | 'completed';
  createdAt: number;
  completedAt?: number;
};

export type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  read: boolean;
  // 画像メッセージ（リサイズ済みのデータURL）。テキストは空でも可。
  imageUrl?: string;
  // For round group chat: which thread this message belongs to. Undefined/empty
  // = the main (本流) chat. Set = a named sub-thread (e.g. 配車相談).
  threadId?: string;
};

// A named sub-thread inside a round's group chat (e.g. 「🚗 配車相談」).
export type RoundThread = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
};

export type Chat = {
  id: string;
  participants: [string, string];
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: Record<string, number>;
  messages: Message[];
};

export type SessionUser = { id: string; displayName: string; avatar: string };
