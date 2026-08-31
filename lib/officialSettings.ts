import { getAdminDb } from './firebase';
import { DEFAULT_FILLED_MESSAGE, type OfficialPrompt } from './officialShared';

// 公式スレッドの運用設定。管理画面から編集する1ドキュメント。
//
// ※ 位置づけが変わった（2026-08-31・同時開催の対応）。
//   ここは**新しく立てる枠の既定のひな形**であって、走っている枠を直接動かすものではない。
//   枠を立てた瞬間に、この内容が `official.prompt` へ写し取られる。
//   したがって、ここを直しても**すでに走っている枠の文面は変わらない**
//   （走っている最中に文面が入れ替わると、見た人と見ていない人で話が食い違うため）。
//   走っている枠の文面を直したいときは、その枠の prompt を直接編集する。
//
//   filledMessage だけは枠に貼らず全体で持つ（成立時にチャットへ流す運営文で、
//   枠ごとに変える理由が無く、変えたくなったら全部まとめて直したいため）。
export type OfficialSettings = {
  /** ホームに出す見出しと本文 */
  popupTitle: string;
  popupBody: string;
  /** 出す相手。空＝絞らない */
  targetGender: '' | 'male' | 'female';
  targetAreas: string[];
  /** 「あとで」を押したら何日出さないか */
  snoozeDays: number;
  /** 枠が埋まった瞬間にチャットへ流す文 */
  filledMessage: string;
  /** 車代の分け方カードを出すか */
  showFareCard: boolean;
  updatedAt?: number;
};

export const DEFAULT_SETTINGS: OfficialSettings = {
  popupTitle: '女性だけでラウンドしませんか？',
  popupBody: 'コースも日程も、集まってから決めます。\n車がなくても大丈夫です。',
  targetGender: 'female',
  targetAreas: [],
  snoozeDays: 7,
  filledMessage: DEFAULT_FILLED_MESSAGE,
  showFareCard: true,
};

const DOC = '_config/officialThread';

export async function getSettings(): Promise<OfficialSettings> {
  const adb = getAdminDb() as any;
  if (!adb) return { ...DEFAULT_SETTINGS };
  try {
    const [c, d] = DOC.split('/');
    const s = await adb.collection(c).doc(d).get();
    return { ...DEFAULT_SETTINGS, ...(s.data() || {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export async function saveSettings(patch: Partial<OfficialSettings>): Promise<OfficialSettings> {
  const cur = await getSettings();
  const next: OfficialSettings = {
    ...cur,
    ...(patch.popupTitle !== undefined ? { popupTitle: String(patch.popupTitle).slice(0, 60) } : {}),
    ...(patch.popupBody !== undefined ? { popupBody: String(patch.popupBody).slice(0, 300) } : {}),
    ...(patch.targetGender !== undefined
      ? { targetGender: (['male', 'female'].includes(String(patch.targetGender)) ? patch.targetGender : '') as any }
      : {}),
    ...(Array.isArray(patch.targetAreas)
      ? { targetAreas: patch.targetAreas.map((a) => String(a).slice(0, 20)).slice(0, 20) }
      : {}),
    ...(patch.snoozeDays !== undefined
      ? { snoozeDays: Math.max(0, Math.min(60, Math.floor(Number(patch.snoozeDays) || 0))) }
      : {}),
    ...(patch.filledMessage !== undefined ? { filledMessage: String(patch.filledMessage).slice(0, 1000) } : {}),
    ...(patch.showFareCard !== undefined ? { showFareCard: !!patch.showFareCard } : {}),
    updatedAt: Date.now(),
  };
  const adb = getAdminDb() as any;
  if (adb) {
    try {
      const [c, d] = DOC.split('/');
      await adb.collection(c).doc(d).set(next, { merge: true });
    } catch { /* 保存に失敗しても既定値で動く */ }
  }
  return next;
}

/** この人に声をかけてよいか（性別・エリアの条件）。既定のひな形で判定する版。 */
export function matchesTarget(s: OfficialSettings, user: { gender?: string; area?: string } | null): boolean {
  if (!user) return false;
  if (s.targetGender && user.gender !== s.targetGender) return false;
  if (s.targetAreas.length && !s.targetAreas.some((a) => (user.area || '').includes(a))) return false;
  return true;
}

/** ひな形から、枠に貼り付ける声かけを作る（写し取り）。 */
export function promptFrom(s: OfficialSettings, over?: Partial<OfficialPrompt>): OfficialPrompt {
  return {
    popupTitle: String(over?.popupTitle ?? s.popupTitle).slice(0, 60),
    popupBody: String(over?.popupBody ?? s.popupBody).slice(0, 300),
    targetGender: (['male', 'female'].includes(String(over?.targetGender ?? s.targetGender))
      ? (over?.targetGender ?? s.targetGender) : '') as OfficialPrompt['targetGender'],
    targetAreas: (Array.isArray(over?.targetAreas) ? over!.targetAreas : s.targetAreas)
      .map((a) => String(a).slice(0, 20)).slice(0, 20),
    snoozeDays: Math.max(0, Math.min(60, Math.floor(Number(over?.snoozeDays ?? s.snoozeDays) || 0))),
    showFareCard: over?.showFareCard !== undefined ? !!over.showFareCard : !!s.showFareCard,
  };
}
