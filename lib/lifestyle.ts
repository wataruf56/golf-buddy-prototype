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
  '医師', '歯科医師', '看護師', '薬剤師', '医療従事者（その他）',
  '弁護士・司法書士・行政書士', '税理士・会計士', 'コンサルタント',
  'エンジニア・IT', 'Web・デザイナー', 'クリエイティブ・映像', 'マスコミ・広告・出版',
  '金融・保険', '商社', 'メーカー・製造', '建設・不動産', '流通・小売',
  '営業', '企画・マーケティング', '事務・管理', '広報・人事',
  '販売・接客', '飲食・フード', '美容・理容', 'アパレル・ファッション',
  '教員・講師', '保育士・幼稚園', '介護・福祉', '農林水産',
  '運輸・物流・ドライバー', '警察・消防・自衛官', 'パイロット・CA',
  'スポーツ・インストラクター', '研究職', 'エンタメ・芸能',
  '学生', 'パート・アルバイト', '主婦・主夫', 'その他',
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
