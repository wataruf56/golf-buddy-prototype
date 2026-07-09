// 機能フラグ（テストアカウント向けの段階公開）。
//
// 「新しく作った機能を、まずはテストアカウントにだけ見せる」ための仕組み。
// - このファイルの FEATURE_REGISTRY に機能を1行足すだけで、管理画面
//   （🧪 テストアカウント管理）に公開範囲トグルが自動で並ぶ。
// - 既定は 'test-only'（＝テストアカウントにだけ見える）。検証が済んだら
//   管理画面で 'all'（全員）に切り替える。'off' は一時的に全員から隠す。
//
// クライアント（bootstrap の戻り値）とサーバー（管理API）双方から読むので、
// 'server-only' は付けない純粋な定数＋関数だけを置く。

export type FeatureVisibility = 'test-only' | 'all' | 'off';

export type FeatureDef = {
  key: string;               // bootstrap の featureFlags[key] で参照するキー
  label: string;             // 管理画面の表示名
  desc: string;              // 管理画面の補足説明
  defaultVisibility: FeatureVisibility;
};

// ▼ 新機能を段階公開したくなったら、ここに1行追加する。
export const FEATURE_REGISTRY: FeatureDef[] = [
  {
    key: 'newFeaturesPreview',
    label: '新機能プレビュー',
    desc: '実験中の新機能をまとめて表示するマスタースイッチ。個別の機能キーを足す前の受け皿としても使える。',
    defaultVisibility: 'test-only',
  },
];

export const FEATURE_VISIBILITIES: FeatureVisibility[] = ['test-only', 'all', 'off'];

export function isFeatureVisibility(v: any): v is FeatureVisibility {
  return v === 'test-only' || v === 'all' || v === 'off';
}

// あるユーザー（テスト or 一般）に対して、各機能が「見えるか」を解決する。
// overrides = 管理画面で保存した機能ごとの公開範囲（未設定なら defaultVisibility）。
export function resolveFeatureFlags(
  isTest: boolean,
  overrides: Record<string, FeatureVisibility> | undefined | null,
): Record<string, boolean> {
  const ov = overrides || {};
  const out: Record<string, boolean> = {};
  for (const f of FEATURE_REGISTRY) {
    const vis = isFeatureVisibility(ov[f.key]) ? ov[f.key] : f.defaultVisibility;
    out[f.key] = vis === 'all' ? true : vis === 'test-only' ? isTest : false;
  }
  return out;
}

// 管理画面用：保存済み overrides を registry と突き合わせて「今の公開範囲」を返す。
export function effectiveVisibilities(
  overrides: Record<string, FeatureVisibility> | undefined | null,
): Record<string, FeatureVisibility> {
  const ov = overrides || {};
  const out: Record<string, FeatureVisibility> = {};
  for (const f of FEATURE_REGISTRY) {
    out[f.key] = isFeatureVisibility(ov[f.key]) ? ov[f.key] : f.defaultVisibility;
  }
  return out;
}
