// ライフスタイル項目の共通定義（クライアント/サーバー両用）。

export const DRINK_OPTIONS: { value: 'yes' | 'sometimes' | 'no'; label: string }[] = [
  { value: 'yes', label: '飲む' },
  { value: 'sometimes', label: 'ときどき' },
  { value: 'no', label: '飲まない' },
];
export const SMOKE_OPTIONS: { value: 'no' | 'yes' | 'sometimes'; label: string }[] = [
  { value: 'no', label: '吸わない' },
  { value: 'yes', label: '吸う' },
  { value: 'sometimes', label: 'ときどき（電子タバコ含む）' },
];
export const JOB_OPTIONS: string[] = [
  '会社員', '経営者・役員', '自営業・フリーランス', '公務員',
  '専門職（医療・士業など）', 'サービス・販売', 'クリエイティブ', '学生', 'その他',
];

export const drinkLabel = (v?: string) => DRINK_OPTIONS.find((o) => o.value === v)?.label || '';
export const smokeLabel = (v?: string) => SMOKE_OPTIONS.find((o) => o.value === v)?.label || '';

// 趣味タグの正規化。前後空白除去・長さ制限・全角/半角空白を1つに。ドキュメントIDにも使う。
export function normalizeHobby(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}
// _hobbyTags のドキュメントID（同名タグを1つに集約）。小文字化はしない（日本語主体のため）。
export function hobbyDocId(name: string): string {
  // Firestore のドキュメントID禁止文字（/ など）を除去。
  return normalizeHobby(name).replace(/[\/\\.#$\[\]]/g, '＿');
}
