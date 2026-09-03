import 'server-only';
import { getAdminDb } from './firebase';
import { STATION_AREA } from './stations';

// 地域ページ（東京・神奈川・千葉）で出す実数。
//
// 【なぜ地域ごとに数える必要があるか】
// 「ゴルフ 東京 20代」で検索した人が知りたいのは、全国の平均ではなく
// **自分の地域で本当に人が集まっているのか**。全体の数字を貼っただけの
// ページは、県名を差し替えただけの薄いページになってしまう。
//
// 実態として、会員は東京・神奈川に多いのに**ラウンドの行き先は千葉に集中**している。
// 東京の人が千葉のコースへ行く構図で、これが送迎（ピックアップ）が要る理由でもある。
// この非対称も含めて出す。都合の悪い数字を隠すと、読む側が判断できない。

export type AreaStats = {
  /** その都道府県に住んでいる会員（test_ は除く） */
  members: number;
  /** その都道府県で開かれたラウンド */
  roundsHere: number;
  /** よく使われているコース（上位3件） */
  courses: string[];
  /** 送迎で拾える駅（その都道府県のもの） */
  stations: string[];
  /** 全体で最も行き先になっている都道府県（東京の人が千葉へ行く、を示すため） */
  topDestination: string;
  topDestinationRounds: number;
};

export const EMPTY_AREA_STATS: AreaStats = {
  members: 0, roundsHere: 0, courses: [], stations: [],
  topDestination: '', topDestinationRounds: 0,
};

export async function getAreaStats(area: string): Promise<AreaStats> {
  const stations = Object.entries(STATION_AREA)
    .filter(([, a]) => a === area).map(([st]) => st);
  const out: AreaStats = { ...EMPTY_AREA_STATS, stations };

  const db = getAdminDb() as any;
  if (!db) return out;
  try {
    const [uSnap, rSnap] = await Promise.all([
      db.collection('users').limit(3000).get(),
      db.collection('rounds').limit(1000).get(),
    ]);
    uSnap.docs.forEach((d: any) => {
      const u = d.data() || {};
      if (String(d.id).startsWith('test_') || u.isSystem) return;
      if (u.area === area) out.members++;
    });

    const byArea: Record<string, number> = {};
    const courses: Record<string, number> = {};
    rSnap.docs.forEach((d: any) => {
      const r = d.data() || {};
      if (String(r.hostId || '').startsWith('test_')) return;
      const a = String(r.area || '');
      if (a) byArea[a] = (byArea[a] || 0) + 1;
      if (a === area && r.courseName) {
        const c = String(r.courseName);
        courses[c] = (courses[c] || 0) + 1;
      }
    });
    out.roundsHere = byArea[area] || 0;
    out.courses = Object.entries(courses).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

    const top = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0];
    if (top) { out.topDestination = top[0]; out.topDestinationRounds = top[1]; }
  } catch (e) {
    console.error('[areaStats] failed', (e as Error).message);
  }
  return out;
}
