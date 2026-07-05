import 'server-only';
import { getAdminDb } from './firebase';

// 再会エンジンの設定。管理画面（wataru のみ）から変更でき、cron と各APIが参照する。
// Firestore: _config/rematch。テスト運用のため intervalDays=0（=完了後すぐ通知）に
// できるようにしている。30秒キャッシュ。
export type RematchConfig = {
  intervalDays: number;        // 前回完了から①再会通知までの日数（＆サイクル間隔）。0=即時
  maxCycles: number;           // 同一ペアへの再会通知の最大回数
  candidateWindowDays: number; // 候補日カレンダーの選択可能範囲（今後N日）
  enabled: boolean;            // 機能全体のON/OFF
  testMode: boolean;           // ON=テストアカウント(test_)同士のペアにしか通知しない安全弁
};

export const DEFAULT_REMATCH_CONFIG: RematchConfig = {
  intervalDays: 14,
  maxCycles: 2,
  candidateWindowDays: 45,
  enabled: true,
  testMode: true, // 誤爆防止：既定はテストのみ。本番運用時に管理画面でOFFにする
};

let _cache: { cfg: RematchConfig; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

function clamp(n: any, lo: number, hi: number, def: number): number {
  const v = parseInt(String(n), 10);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
}

export async function getRematchConfig(): Promise<RematchConfig> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.cfg;
  const db = getAdminDb() as any;
  if (!db) return DEFAULT_REMATCH_CONFIG;
  try {
    const s = await db.collection('_config').doc('rematch').get();
    const d = s.exists ? s.data() : {};
    const cfg: RematchConfig = {
      intervalDays: clamp(d?.intervalDays, 0, 365, DEFAULT_REMATCH_CONFIG.intervalDays),
      maxCycles: clamp(d?.maxCycles, 1, 10, DEFAULT_REMATCH_CONFIG.maxCycles),
      candidateWindowDays: clamp(d?.candidateWindowDays, 7, 180, DEFAULT_REMATCH_CONFIG.candidateWindowDays),
      enabled: d?.enabled !== false,
      testMode: d?.testMode !== false, // 既定 true（未設定＝安全側）
    };
    _cache = { cfg, ts: Date.now() };
    return cfg;
  } catch {
    return _cache?.cfg || DEFAULT_REMATCH_CONFIG;
  }
}

export function invalidateRematchConfigCache(): void { _cache = null; }

export async function setRematchConfig(patch: Partial<RematchConfig>): Promise<RematchConfig> {
  const db = getAdminDb() as any;
  if (!db) throw new Error('firestore not initialized');
  const cur = await getRematchConfig();
  const next: RematchConfig = {
    intervalDays: patch.intervalDays != null ? clamp(patch.intervalDays, 0, 365, cur.intervalDays) : cur.intervalDays,
    maxCycles: patch.maxCycles != null ? clamp(patch.maxCycles, 1, 10, cur.maxCycles) : cur.maxCycles,
    candidateWindowDays: patch.candidateWindowDays != null ? clamp(patch.candidateWindowDays, 7, 180, cur.candidateWindowDays) : cur.candidateWindowDays,
    enabled: patch.enabled != null ? !!patch.enabled : cur.enabled,
    testMode: patch.testMode != null ? !!patch.testMode : cur.testMode,
  };
  await db.collection('_config').doc('rematch').set({ ...next, updatedAt: Date.now() }, { merge: true });
  invalidateRematchConfigCache();
  return next;
}
