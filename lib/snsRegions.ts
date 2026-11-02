// ひとことの「同じ地域」の括り（2026-11-02 本人指定）。判定に使うのはプロフィールのエリア（都道府県）。
//   首都圏：首都圏の人がゴルフに行く県をまとめる／関西：大阪の人が行く範囲を広めに取る／沖縄：本島として1つ。
//   それ以外の県は県ごと。「その他」と未設定は、どの地域にも入らない。
const REGIONS: { name: string; prefs: string[] }[] = [
  { name: '首都圏', prefs: ['東京都', '神奈川県', '千葉県', '埼玉県', '茨城県', '栃木県', '群馬県', '静岡県', '山梨県'] },
  { name: '関西', prefs: ['大阪府', '京都府', '兵庫県', '奈良県', '滋賀県', '和歌山県', '三重県', '岡山県', '徳島県'] },
  { name: '沖縄本島', prefs: ['沖縄県'] },
];
const short = (s: string) => s.replace(/[都府県]$/, '');

/** 地域の名前。どの地域にも入らなければ ''（テスト用の人の「東京」のような県名だけの書き方も読む） */
export function regionOf(area?: string | null): string {
  const a = String(area || '').trim();
  if (!a || a === 'その他') return '';
  return REGIONS.find((r) => r.prefs.some((p) => short(p) === short(a)))?.name || a;
}
