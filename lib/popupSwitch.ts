import { getAdminDb } from './firebase';
import { popupDef } from './popupCatalog';

// ポップアップのオン・オフ（2026-11-01・管理画面「🪟 ポップアップ」）。
// Firestore `_config/popups` に { off: { <id>: { at, note? } }, updatedAt }。書いてあるものが「止めている」。
// /api/bootstrap が止めている id の一覧を配り、端末側の usePopupSlot がその id を出さない（lib/popupSlot）。
// 止められないもの（lib/popupCatalog の lock）はここでも受け付けない。
const DOC = 'popups';
const TTL = 30_000;
let cache: { at: number; off: Record<string, { at: number }> } | null = null;

export async function getPopupOffMap(): Promise<Record<string, { at: number }>> {
  if (cache && Date.now() - cache.at < TTL) return cache.off;
  const adb = getAdminDb() as any;
  if (!adb) return {};
  try {
    const d = (await adb.collection('_config').doc(DOC).get()).data() || {};
    const off: Record<string, { at: number }> = {};
    for (const [id, v] of Object.entries(d.off || {})) if (v && !popupDef(id)?.lock) off[id] = { at: Number((v as any).at) || 0 };
    cache = { at: Date.now(), off };
    return off;
  } catch {
    return cache?.off || {};   // 読めないときは前の値（無ければ全部オン）
  }
}

export async function getPopupOffIds(): Promise<string[]> {
  return Object.keys(await getPopupOffMap());
}

export async function setPopupOff(id: string, off: boolean): Promise<Record<string, { at: number }>> {
  const def = popupDef(id);
  if (!def) throw new Error('unknown_popup');
  if (def.lock) throw new Error('locked');
  const adb = getAdminDb() as any;
  if (!adb) throw new Error('no_db');
  const ref = adb.collection('_config').doc(DOC);
  const { FieldValue } = require('firebase-admin').firestore;
  await ref.set({ off: { [id]: off ? { at: Date.now() } : FieldValue.delete() }, updatedAt: Date.now() }, { merge: true });
  cache = null;
  return getPopupOffMap();
}
