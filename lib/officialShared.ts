import type { Round, User } from './types';

// 運営が代理で立てる募集（＝公式スレッド）。
//
// 【何を解いているか】
// 公式で投稿すると主催者も参加者も運営個人になってしまう。さらに
// 「車がないから募集しちゃいけない気がする」「集まらなかったら恥ずかしい」で
// そもそも募集が出ない。運営が**器だけ**を先に置けば、手を挙げる側は横並びになり、
// 集まらなくても誰も傷つかない。
//
// 【実装の芯】
// 公式スレッドは**最初からラウンド（Round）として作る**。日付もコースも空のまま。
// こうするとグループチャット・レビュー・完了などの既存機能がそのまま乗る。
// 「確定」は部屋を作り直すのではなく、空だった項目が埋まるだけ。
// だから確定の前後で**チャットは1本のまま**続く。
//
// 運営は主催者(hostId)だが**参加者には数えない**（official.hostParticipates=false）。
// currentCount は手を挙げた人数だけを数える。

export type OfficialPattern = 'women' | 'meetup';
export type SlotGender = 'male' | 'female' | 'any';
export type SlotRole = 'any' | 'driver' | 'rider';
export type License = 'have' | 'paper' | 'none';
export type ThreadStage = 'recruiting' | 'deciding' | 'confirmed' | 'closed';

export type OfficialSlot = {
  id: string;
  gender: SlotGender;
  count: number;
  role: SlotRole;
  /** この枠のうち「車を出せる人」の最低人数。1以上なら、その数が埋まるまで
   *  残り1枠は車ありの人しか入れない（4人集まったのに誰も運転できない、を防ぐ）。 */
  minDrivers?: number;
  note?: string;
};

/**
 * ホームでの声かけ。**枠ごとに持つ**。
 *
 * もともとは全体で1組しか持てず、それが「同時に1本まで」の正体だった
 * （2本目を立てると、どちらの枠にどの文面を出すのか決められないため）。
 * 枠に貼り付けることで、女性だけの枠と駅ピックアップの枠を同時に走らせられる。
 *
 * 立てた時点の設定を**写し取って**保存する（参照ではなく複製）。
 * あとで既定のひな形を変えても、走っている枠の文面が勝手に変わらないようにするため。
 */
export type OfficialPrompt = {
  popupTitle: string;
  popupBody: string;
  targetGender: '' | 'male' | 'female';
  targetAreas: string[];
  snoozeDays: number;
  showFareCard: boolean;
};

/**
 * だいたいの開催時期。
 *
 * この企画は「日程を決めずに人だけ先に集める」のが肝なので、日付は空で出す。
 * ただしそれだけだと、見た人が**いつの話なのか分からず手を挙げられない**
 * （会員から「平日なのか土日なのか分からない」と指摘があった）。
 * 日付は決めないまま、選ぶのに足りるだけの粗さで伝えるための項目。
 *
 * 月をまたいで走らせる枠のために year も持つ。持たないと年末に
 * 「1月上旬」が去年なのか来年なのか読めなくなる。
 */
export type DayKind = 'weekday' | 'weekend' | 'any';
export type MonthHalf = 'early' | 'late';
export type OfficialWhen = {
  year: number;
  /** 1〜12 */
  month: number;
  half: MonthHalf;
  days: DayKind;
};

export const DAY_LABEL: Record<DayKind, string> = {
  weekday: '平日',
  weekend: '土日',
  any: '平日・土日どちらでも',
};
export const HALF_LABEL: Record<MonthHalf, string> = { early: '上旬', late: '下旬' };

/** 「9月下旬・土日」。募集カードや一覧に出す短い形。 */
export function whenLabel(w: OfficialWhen | undefined): string {
  if (!w || !w.month) return '';
  return `${w.month}月${HALF_LABEL[w.half]}・${w.days === 'any' ? '平日/土日' : DAY_LABEL[w.days]}`;
}

/** 一覧の日付欄に出す1行。日付そのものは決まっていないことも併せて伝える。 */
export function whenDateRange(w: OfficialWhen | undefined): string {
  const l = whenLabel(w);
  return l ? `${l}ごろ（日程はこれから）` : '日程はこれから決めます';
}

/** 外から来た値を整える。壊れていたら undefined（＝時期は未設定）を返す。 */
export function normalizeWhen(v: any): OfficialWhen | undefined {
  if (!v) return undefined;
  const month = Math.floor(Number(v.month) || 0);
  if (month < 1 || month > 12) return undefined;
  const y = Math.floor(Number(v.year) || 0);
  return {
    year: y >= 2020 && y <= 2100 ? y : new Date().getFullYear(),
    month,
    half: v.half === 'early' ? 'early' : 'late',
    days: v.days === 'weekday' ? 'weekday' : v.days === 'any' ? 'any' : 'weekend',
  };
}

/** 未設定のときの初期値。今月の下旬・土日から始める。 */
export function defaultWhen(now: Date): OfficialWhen {
  return { year: now.getFullYear(), month: now.getMonth() + 1, half: 'late', days: 'weekend' };
}

export type OfficialInfo = {
  pattern: OfficialPattern;
  slots: OfficialSlot[];
  /** B（集合場所つき）の駅。送迎カードの駅に自動で入る。 */
  meetPlace?: string;
  /** 申込時に運転免許を聞くか。A は必須、B は枠で運転者を確保するので通常オフ。 */
  askLicense: boolean;
  expiresAt: number;
  stage: ThreadStage;
  /** userId → slotId */
  slotOf?: Record<string, string>;
  /** userId → 免許（申込時に取得） */
  license?: Record<string, License>;
  /** 集まってから決める3つ。誰でも入力でき、誰が入れたかを残す。 */
  decide?: {
    course?: string; courseBy?: string; courseAt?: number;
    date?: string; startTime?: string; dateBy?: string; dateAt?: number;
    price?: string; priceBy?: string; priceAt?: number;
  };
  confirmedAt?: number;
  confirmedBy?: string;
  /** 成立時の自動メッセージを送ったか（二重送信の防止） */
  filledNotifiedAt?: number;
  /** この枠の声かけ。無いのは同時開催より前に立てた枠＝既定のひな形を使う。 */
  prompt?: OfficialPrompt;
  /** だいたいの開催時期。無いのはこの項目より前に立てた枠。 */
  when?: OfficialWhen;

  // ---- 管理者の代理ラウンド募集（ドライバー先行型） ----
  /**
   * 拾える駅。ドライバーが選んだものをそのまま持つ。
   * meetPlace（単数）は1駅集合の枠のための旧い項目で、こちらは複数駅に対応する。
   */
  stations?: string[];
  /**
   * 車を出す人。この人が抜けても**枠は解散しない**。
   * 同じ駅で車を出せる別の人に声をかけ直して、集まっている参加者はそのまま残す。
   * 抜けたあとは**空文字**にする（undefined は updateRound に捨てられ、
   * Firestore も入れ子の undefined を受け付けないため）。
   */
  driverId?: string;
  /** ドライバーを探し直している最中か（前の人が抜けた）。 */
  driverWanted?: boolean;
};

/** この人に声をかけてよいか（性別・エリアの条件）。枠ごとの prompt で判定する。 */
export function promptMatches(
  p: OfficialPrompt | undefined,
  user: { gender?: string; area?: string } | null,
): boolean {
  if (!user) return false;
  if (!p) return true;   // 文面が無い枠は絞り込みもしない
  if (p.targetGender && user.gender !== p.targetGender) return false;
  if (p.targetAreas.length && !p.targetAreas.some((a) => (user.area || '').includes(a))) return false;
  return true;
}

export const LICENSE_LABEL: Record<License, string> = {
  have: '🚗 免許あり',
  paper: '📄 免許あり（ペーパードライバー）',
  none: '🙅 免許なし',
};

export const PATTERN_TITLE: Record<OfficialPattern, string> = {
  women: '女性だけで、のんびりラウンド',
  meetup: '{place}で集まってラウンド',
};

/** 締め切りの既定（日）。過ぎたら静かに閉じる。 */
export const DEFAULT_EXPIRE_DAYS = 14;

const of = (r: Round): OfficialInfo | null => ((r as any).official as OfficialInfo) || null;
export const officialOf = of;
export const isOfficialThread = (r: Round | null | undefined) => !!r && !!of(r);

/** まだ動いている（募集中 or 決めること待ち）スレッドか。 */
export const isActiveStage = (s: ThreadStage) => s === 'recruiting' || s === 'deciding';

// ── 枠の集計 ────────────────────────────────────────────────
export type SlotState = {
  slot: OfficialSlot;
  taken: string[];      // この枠に入っている userId
  left: number;
  /** この枠に「車を出せる人」が何人入ったか */
  drivers: number;
  /** 残り枠が「車を出せる方」に固定されているか */
  driverOnly: boolean;
};

export function slotStates(round: Round, users: Record<string, User | undefined>): SlotState[] {
  const o = of(round);
  if (!o) return [];
  const slotOf = o.slotOf || {};
  return o.slots.map((slot) => {
    const taken = (round.applicantIds || []).filter((uid) => slotOf[uid] === slot.id);
    const drivers = taken.filter((uid) => users[uid]?.car === 'have').length;
    const left = Math.max(0, slot.count - taken.length);
    const need = Math.max(0, (slot.minDrivers || 0) - drivers);
    // 残り枠と「あと何人の運転者が要るか」が並んだら、残りは運転者専用になる。
    return { slot, taken, left, drivers, driverOnly: need > 0 && need >= left };
  });
}

export const totalSeats = (round: Round) =>
  (of(round)?.slots || []).reduce((a, s) => a + s.count, 0);
export const takenSeats = (round: Round) => (round.applicantIds || []).length;
export const isFilled = (round: Round) => takenSeats(round) >= totalSeats(round) && totalSeats(round) > 0;

// ── 参加できるか ───────────────────────────────────────────
export type JoinCheck = { ok: true } | { ok: false; reason: string; message: string };

export function canJoinSlot(
  round: Round, slotId: string, me: User | undefined, users: Record<string, User | undefined>,
): JoinCheck {
  const o = of(round);
  if (!o) return { ok: false, reason: 'not_official', message: 'この募集は対象外です' };
  if (o.stage !== 'recruiting') return { ok: false, reason: 'closed', message: 'この枠は募集を終えています' };
  if (Date.now() > o.expiresAt) return { ok: false, reason: 'expired', message: 'この枠は締め切りました' };
  if (!me) return { ok: false, reason: 'no_user', message: 'ログインが必要です' };
  if ((round.applicantIds || []).includes(me.id)) {
    return { ok: false, reason: 'already', message: 'すでに参加しています' };
  }

  const st = slotStates(round, users).find((s) => s.slot.id === slotId);
  if (!st) return { ok: false, reason: 'no_slot', message: '枠が見つかりません' };
  if (st.left <= 0) return { ok: false, reason: 'full', message: 'この枠は埋まりました' };

  const g = st.slot.gender;
  if (g !== 'any' && me.gender !== g) {
    return { ok: false, reason: 'gender', message: g === 'female' ? '女性の方の枠です' : '男性の方の枠です' };
  }
  // 「車を出す」役割の枠、または残りが運転者専用になった枠は、車ありの人だけ。
  const needsCar = st.slot.role === 'driver' || st.driverOnly;
  if (needsCar && me.car !== 'have') {
    return { ok: false, reason: 'need_car', message: '車を出せる方の枠です' };
  }
  return { ok: true };
}

// ── 作る（純粋な部分） ───────────────────────────────────
// ── 作る ───────────────────────────────────────────────────
export function defaultSlots(pattern: OfficialPattern, place?: string): OfficialSlot[] {
  if (pattern === 'women') {
    return [{ id: 's1', gender: 'female', count: 4, role: 'any' }];
  }
  return [
    { id: 's1', gender: 'female', count: 2, role: 'rider', note: place ? `${place}まで来られる方` : undefined },
    { id: 's2', gender: 'male', count: 2, role: 'any', minDrivers: 1,
      note: place ? `うち1人は${place}で拾える方` : 'うち1人は車を出せる方' },
  ];
}

export function titleFor(pattern: OfficialPattern, place?: string): string {
  return pattern === 'women'
    ? PATTERN_TITLE.women
    : PATTERN_TITLE.meetup.replace('{place}', place || '現地');
}

// ── 成立したときの自動メッセージ ─────────────────────────────
export const DEFAULT_FILLED_MESSAGE =
  '車の配車や、ゴルフ場を誰が予約するかなどを、ここで話し合ってください。\n\n'
  + 'まず「行ける日程」を選んでください。\n\n'
  + '決まったら「決めること」の画面に、ゴルフ場・日時・参加費を入れてください。';

export function licenseSummary(o: OfficialInfo, memberIds: string[], users: Record<string, User | undefined>): string {
  const lic = o.license || {};
  const g = (k: License) => memberIds.filter((id) => lic[id] === k);
  const line = (k: License) => {
    const ids = g(k);
    if (!ids.length) return '';
    const names = ids.map((id) => users[id]?.displayName || '？').join('・');
    return `${LICENSE_LABEL[k]} ${ids.length}人：${names}`;
  };
  return [line('have'), line('paper'), line('none')].filter(Boolean).join('\n');
}
