import 'server-only';
import { getAdminDb } from './firebase';
import { renderFromOverrides, NOTIF_TEMPLATES } from './notificationTemplates';
import type { NotifChannels, RenderedNotif } from './notificationTemplates';

// 通知テンプレートの上書き（管理画面で編集した文面）を保存・取得する。
// Firestore `_config/notificationTemplates` に { key: {inApp?,line?,webTitle?} }
// の形で保存。30秒キャッシュ。未設定のキー／項目は lib/notificationTemplates の
// デフォルト文面にフォールバックする。
// ※ webBody（旧スマホ通知本文）は廃止。スマホ通知の本文は line と共通のため保存しない。

let _cache: { ov: Record<string, NotifChannels>; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

const VALID_KEYS = new Set(NOTIF_TEMPLATES.map((t) => t.key));

function normalize(raw: any): Record<string, NotifChannels> {
  const out: Record<string, NotifChannels> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!VALID_KEYS.has(k) || !v || typeof v !== 'object') continue;
    const c: NotifChannels = {};
    // webBody は廃止（スマホ通知本文は line と共通）。保存対象にしない。
    for (const f of ['inApp', 'line', 'webTitle'] as const) {
      const val = (v as any)[f];
      if (typeof val === 'string' && val.trim() !== '') c[f] = String(val).slice(0, 800);
    }
    if (Object.keys(c).length) out[k] = c;
  }
  return out;
}

export async function getNotifOverrides(): Promise<Record<string, NotifChannels>> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.ov;
  const db = getAdminDb() as any;
  if (!db) return {};
  try {
    const snap = await db.collection('_config').doc('notificationTemplates').get();
    const ov = normalize(snap.exists ? snap.data()?.templates : {});
    _cache = { ov, ts: Date.now() };
    return ov;
  } catch {
    return _cache?.ov || {};
  }
}

export function invalidateNotifTemplateCache(): void { _cache = null; }

export async function saveNotifOverrides(patch: Record<string, NotifChannels>): Promise<Record<string, NotifChannels>> {
  const db = getAdminDb() as any;
  if (!db) throw new Error('firestore not initialized');
  const templates = normalize(patch);
  await db.collection('_config').doc('notificationTemplates').set({ templates, updatedAt: Date.now() }, { merge: false });
  invalidateNotifTemplateCache();
  return templates;
}

// 送信側から使うメイン関数。キーと差し込み変数を渡すと4チャネル分の文面が返る。
//   const n = await renderNotif('applyReceived', { '申請者名': name, '募集タイトル': title });
//   addNotification(uid, 'applyReceived', n.inApp, link);  // n.inApp が null のキーは呼ばない
//   pushTo(uid, n.line, ...); webPushText(uid, n.webTitle, n.webBody, ...);
export async function renderNotif(key: string, vars: Record<string, string> = {}): Promise<RenderedNotif> {
  const ov = await getNotifOverrides();
  return renderFromOverrides(key, ov, vars);
}
