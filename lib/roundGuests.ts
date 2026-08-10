import type { RoundGuest } from './types';

// 「主催者の知り合い（externalMale + externalFemale）」＝ ゴルトモ未登録の同伴者の人数。
// その人数ぶんのスロットに名前を付けたものが guests[]（= 参加者一覧・入金タブに並ぶゲスト）。
// つまり guests は external の“名札”であり、人数を二重に増やすものではない。
//
// reconcileGuests: 募集人数タブから送られた名前配列(names)を、既存 guests と突き合わせて
// 新しい guests[] を作る。既存の id は同じ位置なら維持する（入金チェックや組み分けが外れない）。
// 名前が空でも保存できる（「知り合い1」のような既定名を入れてスロットを維持する）。
export function reconcileGuests(existing: RoundGuest[] | undefined, names: string[]): RoundGuest[] {
  const prev = existing || [];
  const out: RoundGuest[] = [];
  names.slice(0, 60).forEach((raw, i) => {
    const name = String(raw ?? '').trim().slice(0, 30) || `知り合い${i + 1}`;
    const keep = prev[i];
    out.push({ id: keep?.id || `gst_${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 7)}`, name });
  });
  return out;
}

// 既存の guests から、募集人数タブの入力欄の初期値（名前の配列）を作る。
// 自動採番の既定名（知り合い1 等）は「未入力」として空で見せる（本人の名前を促すため）。
export function guestNamesFrom(existing: RoundGuest[] | undefined, count: number): string[] {
  const prev = existing || [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const n = prev[i]?.name || '';
    return /^知り合い\d+$/.test(n) ? '' : n;
  });
}
