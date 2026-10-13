import { computeLpStats, EMPTY_LP_STATS, type LpStats } from './lpStats';

// 記事ページ共通の実績データ取得。
//
// 記事の強みは「一般論ではなく運用中の実数を出せること」なので、
// どの記事からも同じ数字を同じ条件で引けるようにここへ集約する。
// 集計に失敗しても記事自体は必ず表示する（数字は出さないだけ）。
export type GuideStats = LpStats & {
  openCount: number;
  /** 年代ごとの会員数。「20代も30代も同じだけいる」を記事で言うために使う。
   *  年齢を入れていない人がいるので、母数は ageKnown（年齢がわかる人）で持つ。 */
  age20s: number; age30s: number; ageKnown: number;
};

export async function getGuideStats(): Promise<GuideStats> {
  let stats: LpStats = { ...EMPTY_LP_STATS };
  let openCount = 0;
  let age20s = 0, age30s = 0, ageKnown = 0;
  try {
    const { getAdminDb } = await import('./firebase');
    const adb = getAdminDb() as any;
    if (adb) stats = await computeLpStats(adb);
  } catch { /* 数字が出せなくても記事は表示する */ }
  // 年代の内訳。検証用アカウントは実績に混ぜない。
  try {
    const { getAdminDb } = await import('./firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      const snap = await adb.collection('users').limit(2000).get();
      for (const d of snap.docs) {
        if (String(d.id).startsWith('test_')) continue;
        const age = Number((d.data() || {}).age || 0);
        if (!age) continue;
        ageKnown++;
        if (age >= 20 && age <= 29) age20s++;
        else if (age >= 30 && age <= 39) age30s++;
      }
    }
  } catch { /* 数字が出せなくても記事は表示する */ }

  try {
    const { db } = await import('./db');
    const open = await db.listRounds({ status: 'open' });
    // 撮影用のテスト投稿は実績に混ぜない（満員率が実態より高く出てしまうため）
    openCount = open.filter((r: any) => !String(r.hostId || '').startsWith('test_')).length;
  } catch { /* noop */ }
  return { ...stats, openCount, age20s, age30s, ageKnown };
}

// 数字を出してよいか（母数が少なすぎる数字は載せない）
export const hasFillData = (s: GuideStats) => s.fillRate != null && s.fillN >= 3;
export const hasAgainData = (s: GuideStats) => s.againRate != null && s.againN >= 20;
/** 年代の内訳は、母数が小さいうちは出さない（割合がぶれるため）。 */
export const hasAgeData = (s: GuideStats) => s.ageKnown >= 30;
