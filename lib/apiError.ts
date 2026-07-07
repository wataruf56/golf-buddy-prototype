// 失敗レスポンスから、ユーザー向けの日本語メッセージだけを取り出す。
// サーバは { error, message } を返す。message があればそれを、無ければ汎用文言。
// これで「失敗 403 { error ... }」のようなシステム文字列をトーストに出さない。
export async function readApiError(res: Response, fallback = '通信に失敗しました'): Promise<string> {
  try {
    const d = await res.clone().json();
    if (d && typeof d.message === 'string' && d.message.trim()) return d.message;
    if (d && typeof d.error === 'string' && /^[一-龠ぁ-んァ-ヶ]/.test(d.error)) return d.error;
  } catch { /* not json */ }
  return fallback;
}
