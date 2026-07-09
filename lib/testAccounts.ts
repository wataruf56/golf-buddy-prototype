import 'server-only';
import { getAdminDb } from './firebase';
import type { FeatureVisibility } from './featureFlags';
import { isFeatureVisibility } from './featureFlags';

// テストアカウントの一元管理（再会エンジンから外出しした版）。
// Firestore `_config/testAccounts` に保存し、30秒キャッシュ。
//   accounts       : 手動登録したテストアカウント（実LINEユーザーID＋任意ラベル）
//   hideFromGeneral: true=一般ユーザーからプロフィール＆募集を隠す（既定 true）
//   features       : 機能キーごとの公開範囲（lib/featureFlags の overrides）
//
// これを唯一の情報源として、①bootstrap の可視性フィルタ ②再会エンジンの
// テスト判定 ③機能フラグ が参照する。以前は _config/rematch.testUserIds に
// 埋まっていたため、testAccounts ドキュメントが未作成のときは自動で移行シードする。

export type TestAccount = { id: string; label: string; addedAt: number };

export type TestAccountConfig = {
  accounts: TestAccount[];
  hideFromGeneral: boolean;
  features: Record<string, FeatureVisibility>;
};

export const DEFAULT_TEST_ACCOUNT_CONFIG: TestAccountConfig = {
  accounts: [],
  hideFromGeneral: true,
  features: {},
};

let _cache: { cfg: TestAccountConfig; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

function normFeatures(raw: any): Record<string, FeatureVisibility> {
  const out: Record<string, FeatureVisibility> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (isFeatureVisibility(v)) out[k] = v;
    }
  }
  return out;
}

function normAccounts(raw: any): TestAccount[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TestAccount[] = [];
  for (const a of raw) {
    const id = String(a?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: String(a?.label ?? '').trim().slice(0, 60),
      addedAt: Number.isFinite(a?.addedAt) ? Number(a.addedAt) : 0,
    });
  }
  return out.slice(0, 100);
}

// _config/rematch.testUserIds からの一回きりの移行シード（testAccounts 未作成時のみ）。
async function seedFromRematch(db: any): Promise<TestAccount[]> {
  try {
    const s = await db.collection('_config').doc('rematch').get();
    const ids: string[] = s.exists && Array.isArray(s.data()?.testUserIds) ? s.data().testUserIds : [];
    return normAccounts(ids.map((id) => ({ id, label: '', addedAt: 0 })));
  } catch {
    return [];
  }
}

export async function getTestAccountConfig(): Promise<TestAccountConfig> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.cfg;
  const db = getAdminDb() as any;
  if (!db) return DEFAULT_TEST_ACCOUNT_CONFIG;
  try {
    const snap = await db.collection('_config').doc('testAccounts').get();
    let cfg: TestAccountConfig;
    if (snap.exists) {
      const d = snap.data() || {};
      cfg = {
        accounts: normAccounts(d.accounts),
        hideFromGeneral: d.hideFromGeneral !== false, // 未設定＝安全側(隠す)
        features: normFeatures(d.features),
      };
    } else {
      // 未移行：旧 _config/rematch.testUserIds から読み込む（この時点では永続化せず、
      // 管理画面で保存された時点で testAccounts ドキュメントが確定する）。
      cfg = { accounts: await seedFromRematch(db), hideFromGeneral: true, features: {} };
    }
    _cache = { cfg, ts: Date.now() };
    return cfg;
  } catch {
    return _cache?.cfg || DEFAULT_TEST_ACCOUNT_CONFIG;
  }
}

export function invalidateTestAccountCache(): void { _cache = null; }

// 明示登録された ID の集合（test_ プレフィックスは含まない）。
export async function getTestAccountIdSet(): Promise<Set<string>> {
  const cfg = await getTestAccountConfig();
  return new Set(cfg.accounts.map((a) => a.id));
}

// そのユーザーがテスト扱いか。test_ 始まり（デモ用の合成ユーザー）or 明示登録。
export async function isTestAccount(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  if (id.startsWith('test_')) return true;
  const set = await getTestAccountIdSet();
  return set.has(id);
}

export async function saveTestAccountConfig(patch: Partial<TestAccountConfig>): Promise<TestAccountConfig> {
  const db = getAdminDb() as any;
  if (!db) throw new Error('firestore not initialized');
  const cur = await getTestAccountConfig();
  const next: TestAccountConfig = {
    accounts: patch.accounts != null ? normAccounts(patch.accounts) : cur.accounts,
    hideFromGeneral: patch.hideFromGeneral != null ? !!patch.hideFromGeneral : cur.hideFromGeneral,
    features: patch.features != null ? normFeatures(patch.features) : cur.features,
  };
  await db.collection('_config').doc('testAccounts').set({ ...next, updatedAt: Date.now() }, { merge: true });
  invalidateTestAccountCache();
  return next;
}
