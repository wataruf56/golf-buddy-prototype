import type { Round } from './types';

// ゴルトモ公式コンペか（2026-10-21・lib/lpStats から切り出し）。コンペ（isCompetition）で、運営が主催したもの。
// 運営が主催した公式コンペなのに isOfficial が付いていない過去の募集（本人確認 2026-10-15）。
//   9xN38TLiDpyksZnLvM6i … 9/13「同世代でゆるっとゴルフ」
//   WduL3gVEnHQ0VwTrPo3n … 9/26「ギネス記録のホールにチャレンジ」
// データに isOfficial を付けると公式募集として扱いが変わる（主催者の数え方・一覧など）ため、ここで足す。
export const OFFICIAL_COMPE_EXTRA_IDS = new Set(['9xN38TLiDpyksZnLvM6i', 'WduL3gVEnHQ0VwTrPo3n']);

export function isOfficialCompe(r: Partial<Round> & { id?: string }): boolean {
  return !!r.isCompetition && (!!r.isOfficial || OFFICIAL_COMPE_EXTRA_IDS.has(String(r.id || '')));
}
