// 「行ける日」の、画面（client）とサーバーの両方で使う小さな道具。
// lib/availability.ts は server-only なので、型と日付の計算だけをこちらに置く。

/** 一覧に載せる1人ぶん。誰に見せるかで、名前を付けるか付けないかが変わる（lib/availability）。 */
export type AvailPerson = {
  age: number; gender: 'male' | 'female'; car: boolean;
  /** 車を出せる人だけ：乗れる人数（運転手込み）とゴルフバッグの数。2〜8 */
  seats?: number; bags?: number;
  me?: boolean;
  // 女性が見るとき（と自分の分）だけ
  id?: string; name?: string; avatar?: string; avatarUrl?: string; avatarMode?: string; color?: string; golmotiType?: string;
};

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' → { md:'10/4', w:'土', dow:6 } */
export function dateLabel(iso: string): { md: string; w: string; dow: number } {
  const d = new Date(iso + 'T00:00:00');
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, w: WEEKDAYS[d.getDay()], dow: d.getDay() };
}

export function isoOf(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** from〜to（'YYYY-MM-DD'）にかかる月を [{y, m0}] で。カレンダーの「‹ ›」の範囲。 */
export function monthsBetween(from: string, to: string): Array<{ y: number; m0: number }> {
  const out: Array<{ y: number; m0: number }> = [];
  let y = Number(from.slice(0, 4)); let m0 = Number(from.slice(5, 7)) - 1;
  const ey = Number(to.slice(0, 4)); const em0 = Number(to.slice(5, 7)) - 1;
  while (y < ey || (y === ey && m0 <= em0)) {
    out.push({ y, m0 });
    m0 += 1; if (m0 > 11) { m0 = 0; y += 1; }
    if (out.length > 12) break;
  }
  return out;
}

/** 乗れる人数・バッグの数は 2〜8。それ以外は「未設定」。 */
export function clampCarNum(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  return i >= 2 && i <= 8 ? i : undefined;
}

/**
 * 「行ける日」を出すのに最寄り駅が要るか（2026-09-27 本人判断）。
 * 運営は最寄り駅の近さで乗り合いと集合駅を決めるので、駅が無い人の「行ける」は組み込めない。
 * 未入力の人には入力を案内し、入力が済んだら使えるようにする。
 */
export function needsStation(u: { nearestStation?: string } | null | undefined): boolean {
  return !String(u?.nearestStation || '').trim();
}

/** 同じ日に「行ける」を押した人がこの人数になったら、その日のチャット部屋ができる（2026-10-04 に 4→3）。 */
export const AVAIL_ROOM_MIN = 3;

/** 「行ける日」の集まり（日付ごとのチャット部屋）か。運営主催のラウンドの形で作られる。 */
export function isAvailRoom(r: { availDate?: string } | null | undefined): boolean {
  return !!r?.availDate;
}

export function availRoomTitle(iso: string): string {
  const l = dateLabel(iso);
  return `${l.md}（${l.w}）に行ける人の集まり`;
}

export const NEEDS_STATION_MSG = '行ける日を出すには、プロフィールで最寄り駅を登録してください（他の会員には表示されません）';
