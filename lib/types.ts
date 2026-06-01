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
  golfHistory?: string;        // 「1年未満」「3〜5年」など
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
  maxSpots: number;
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
