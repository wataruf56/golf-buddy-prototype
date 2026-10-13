// 最終ログインの見せ方（ゴル友タブ）（2026-10-13）。lastActiveAt はアプリを開いたとき（bootstrap）に最大5分おきに更新される。
//   5分以内        … 「ログイン中」（緑の点）
//   5分〜1時間     … 「5分前にログイン」「30分前にログイン」（5分きざみ）
//   1時間〜今日    … 「最終ログイン 14:20」
//   昨日           … 「最終ログイン 昨日 21:05」
//   それより前     … 「最終ログイン 10/8」／30日より前は「最終ログイン 1か月以上前」
// 日付は日本時間で判定する。
const JST = 9 * 3600 * 1000;
const dayKey = (ms: number) => new Date(ms + JST).toISOString().slice(0, 10);
const hm = (ms: number) => { const d = new Date(ms + JST); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

export function loginLabel(at: number | undefined | null, now = Date.now()): { text: string; live: boolean } | null {
  const t = Number(at) || 0;
  if (!t) return null;
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 5) return { text: 'ログイン中', live: true };
  if (min < 60) return { text: `${Math.floor(min / 5) * 5}分前にログイン`, live: false };
  if (dayKey(t) === dayKey(now)) return { text: `最終ログイン ${hm(t)}`, live: false };
  if (dayKey(t) === dayKey(now - 86400000)) return { text: `最終ログイン 昨日 ${hm(t)}`, live: false };
  if (diff > 30 * 86400000) return { text: '最終ログイン 1か月以上前', live: false };
  const d = new Date(t + JST);
  return { text: `最終ログイン ${d.getUTCMonth() + 1}/${d.getUTCDate()}`, live: false };
}
