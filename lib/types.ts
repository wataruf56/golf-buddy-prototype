export type Gender = 'male' | 'female' | 'other';
export type CarStatus = 'have' | 'none';

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
  color: string;
  lineId?: string;
  reviewAvg: number;
  reviewCount: number;
  roundCount: number;
  buddyCount: number;
  blockedUserIds?: string[];
  recentScores?: ScoreEntry[];
  notifyOff?: boolean;        // legacy master switch (true = all notifications off)
  // Per-type notification preferences for the LINE official account + web push.
  // Keys are NotifyType (lib/notifyPrefs). Missing key → that type's default.
  notifyPrefs?: Record<string, boolean>;
  // 「お知らせ」(アプリ内通知インボックス) を最後に既読にした時刻。これより
  // 新しい createdAt の通知が未読扱い。
  notifReadAt?: number;
  golfHistory?: string;        // 「1年未満」「3〜5年」など
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
  // 他アプリ等で既に集まっている「アプリ外メンバー」の人数。主催者と同様に
  // 最初から枠を埋めている扱い（currentCount に算入）。
  externalCount?: number;
  currentCount: number;
  applicantIds: string[];
  pendingApplicantIds?: string[];
  price?: string;
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
  status: RoundStatus;
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
};

export type RoundGroup = {
  id: string;
  startTime?: string;
  memberIds: string[];
};

export type Review = {
  id: string;
  roundId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number;
  tags: string[];
  comment?: string;
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
