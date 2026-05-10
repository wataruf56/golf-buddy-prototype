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
  notifyOff?: boolean;
  golfHistory?: string;        // 「1年未満」「3〜5年」など
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
  levelCondition: string;
  description?: string;
  status: RoundStatus;
  isCompetition: boolean;
  createdAt: number;
  // Per-participant scores recorded after the round completes. Optional and
  // sparse — any participant may fill in their own or each other's score, and
  // saved entries are also mirrored into each user's recentScores list so
  // their profile updates automatically.
  scores?: Record<string, number>;
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
