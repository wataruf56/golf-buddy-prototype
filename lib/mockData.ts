import type { Chat, PendingReview, Review, Round, User } from './types';

export const ME_ID = 'me';

export const mockUsers: User[] = [
  { id: ME_ID, displayName: 'テスト太郎', age: 34, area: '神奈川県', scoreRange: '105〜115', playStyle: 'のんびり派', frequency: '月2回', avatar: '⛳', color: '#2D8C4E', reviewAvg: 4.5, reviewCount: 12, roundCount: 7, buddyCount: 3 },
  { id: 'u1', displayName: '田中 健太', age: 28, area: '神奈川県', scoreRange: '105〜115', playStyle: 'のんびり派', frequency: '月2回', avatar: '🧑', color: '#3478F6', reviewAvg: 4.3, reviewCount: 12, roundCount: 9, buddyCount: 2 },
  { id: 'u2', displayName: '佐藤 美咲', age: 32, area: '神奈川県', scoreRange: '110〜120', playStyle: 'エンジョイ派', frequency: '月1回', avatar: '👩', color: '#E67E22', reviewAvg: 4.6, reviewCount: 8, roundCount: 6, buddyCount: 4 },
  { id: 'u3', displayName: '鈴木 大輔', age: 35, area: '東京都', scoreRange: '95〜105', playStyle: 'サクサク派', frequency: '月3回', avatar: '👨', color: '#2D8C4E', reviewAvg: 4.8, reviewCount: 23, roundCount: 18, buddyCount: 6 },
  { id: 'u4', displayName: '山田 翔', age: 29, area: '埼玉県', scoreRange: '100〜110', playStyle: '研究派', frequency: '月2回', avatar: '🧔', color: '#E74C3C', reviewAvg: 4.4, reviewCount: 15, roundCount: 11, buddyCount: 3 },
];

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

export const mockRounds: Round[] = [
  {
    id: 'r1', hostId: 'u3', title: '初心者歓迎！のんびりラウンド',
    type: 'confirmed', courseName: '湘南カントリークラブ', area: '神奈川県西部',
    dateType: 'fixed', date: '2026-06-28', startTime: '8:30',
    maxSpots: 4, currentCount: 2, applicantIds: ['u1'],
    price: '¥8,000〜', levelCondition: '初心者OK',
    description: '初心者の方も大歓迎！のんびり楽しく回りましょう。',
    pickupStations: ['新宿', '渋谷', '横浜'], pickupCapacity: 3,
    status: 'open', isCompetition: false, hostCohort: 'a', createdAt: now - 2 * day,
  },
  {
    id: 'r2', hostId: 'u1', title: '平日ゆるラウンド（コース未定）',
    type: 'flexible', area: '千葉県',
    dateType: 'range', dateRange: '6月下旬の平日どこか',
    maxSpots: 4, currentCount: 1, applicantIds: [],
    price: '¥6,500〜', levelCondition: 'スコア不問',
    description: '日程・コース相談しながら決めましょう',
    status: 'open', isCompetition: false, hostCohort: 'a', createdAt: now - 1 * day,
  },
  {
    id: 'r3', hostId: 'u2', title: '女性歓迎☀️ エンジョイゴルフ',
    type: 'confirmed', courseName: '埼玉国際ゴルフ倶楽部', area: '埼玉県',
    dateType: 'fixed', date: '2026-07-05', startTime: '7:30',
    maxSpots: 4, currentCount: 3, applicantIds: ['u3'],
    price: '¥9,000〜', levelCondition: '120以下',
    description: '女性も大歓迎、和気あいあいで！',
    status: 'open', isCompetition: false, hostCohort: 'a', createdAt: now - 3 * day,
  },
  {
    id: 'r4', hostId: 'u3', title: '🏆 夏のメンバーコンペ2026',
    type: 'confirmed', courseName: '湘南カントリークラブ', area: '神奈川県',
    dateType: 'fixed', date: '2026-07-12', startTime: '7:00',
    maxSpots: 20, currentCount: 12, applicantIds: ['u1', 'u2', 'u4'],
    price: '¥12,000〜（コンペフィー込）', levelCondition: 'スコア不問',
    description: '恒例の夏メンバーコンペ！表彰式と懇親会あり',
    status: 'open', isCompetition: true, hostCohort: 'a', createdAt: now - 5 * day,
  },
  {
    id: 'r5', hostId: 'u4', title: '梅雨明けエンジョイラウンド',
    type: 'flexible', area: '茨城県',
    dateType: 'range', dateRange: '7月の土日',
    maxSpots: 4, currentCount: 1, applicantIds: [],
    price: '¥7,000〜9,000', levelCondition: 'スコア不問',
    description: '梅雨明けタイミングで日程確定します',
    status: 'open', isCompetition: false, hostCohort: 'a', createdAt: now - 4 * day,
  },
];

export const mockReviews: Review[] = [
  { id: 'rv1', roundId: 'past1', reviewerId: 'u1', revieweeId: ME_ID, stars: 5, tags: ['マナーが良い', '時間厳守'], comment: '気さくで話しやすい方でした！', createdAt: now - 30 * day, isAnonymous: true },
  { id: 'rv2', roundId: 'past1', reviewerId: 'u2', revieweeId: ME_ID, stars: 4, tags: ['楽しい雰囲気'], comment: 'ペースもちょうどよく楽しかったです', createdAt: now - 30 * day, isAnonymous: true },
  { id: 'rv3', roundId: 'past2', reviewerId: ME_ID, revieweeId: 'u3', stars: 5, tags: ['マナーが良い', '教え上手'], comment: '初心者に優しく教えてくれました', createdAt: now - 20 * day, isAnonymous: true },
  { id: 'rv4', roundId: 'past2', reviewerId: 'u1', revieweeId: 'u3', stars: 5, tags: ['マナーが良い', '時間厳守'], comment: 'マナーが良く、また一緒に回りたいです', createdAt: now - 20 * day, isAnonymous: true },
];

export const mockPendingReviews: PendingReview[] = [];

export const mockChats: Chat[] = [
  {
    id: [ME_ID, 'u3'].sort().join('_'),
    participants: [ME_ID, 'u3'],
    lastMessage: '来月あたりどうですか？神奈川で探してみます',
    lastMessageAt: now - 1 * day,
    unreadCount: { [ME_ID]: 1, u3: 0 },
    messages: [
      { id: 'm1', senderId: 'u3', text: '先日はありがとうございました！楽しかったです', createdAt: now - 2 * day, read: true },
      { id: 'm2', senderId: ME_ID, text: 'こちらこそ！またぜひ行きましょう', createdAt: now - 2 * day + 1000, read: true },
      { id: 'm3', senderId: 'u3', text: '来月あたりどうですか？神奈川で探してみます', createdAt: now - 1 * day, read: false },
    ],
  },
];

// Flat tag list. Review UI requires at least 1 selected; the free-form
// comment is optional. Order matters — positives first, negatives last —
// because the picker renders them in declaration order.
export const reviewTags = [
  // --- positive ---
  '✨ マナーが良い',
  '⏰ 時間厳守',
  '⛳ プレイファースト徹底',
  '😄 楽しい雰囲気',
  '👍 教え上手',
  '🙌 すごく推せる',
  '🤝 また一緒に回りたい',
  '🌱 初心者に優しい',
  // --- negative ---
  '🐢 スロープレイ気味',
  '⏱️ 遅刻・ドタキャン',
  '⚠️ マナーが気になった',
  '🚫 全然おすすめしない',
  '😬 雰囲気が合わなかった',
];

export const allAreas = [
  '東京都', '神奈川県', '千葉県', '埼玉県', '茨城県', '栃木県', '群馬県', '静岡県', '山梨県', 'その他',
];

export const levelOptions = [
  'スコア不問',
  '初心者OK',
  '初心者のみ',
  '中級者以上',
  '上級者のみ',
  '120以下',
  '110以下',
  '100以下',
  '90以下',
  '80以下',
  '男性募集',
  '女性募集',
  '男女混合',
  '20代',
  '30代',
  '40代',
  '50代以上',
  '同年代',
];
