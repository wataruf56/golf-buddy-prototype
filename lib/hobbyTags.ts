import 'server-only';
import { getAdminDb } from './firebase';
import { normalizeHobby, hobbyDocId } from './lifestyle';

// 趣味タグの共有台帳（_hobbyTags）。ドキュメント: { name, count }。count はおおよその
// 利用ユーザー数（人気順サジェスト用）。誰でも即追加でき、運営が不適切タグを削除できる。
const COL = '_hobbyTags';

export async function listHobbyTags(limit = 300): Promise<Array<{ name: string; count: number }>> {
  const db = getAdminDb() as any;
  if (!db) return [];
  try {
    const snap = await db.collection(COL).limit(1000).get();
    const tags = snap.docs
      .map((d: any) => ({ name: d.data()?.name || d.id, count: Number(d.data()?.count || 0) }))
      .filter((t: any) => t.name && t.count > 0)
      .sort((a: any, b: any) => b.count - a.count || String(a.name).localeCompare(String(b.name)))
      .slice(0, limit);
    return tags;
  } catch {
    return [];
  }
}

// ユーザーの趣味変更に合わせて台帳の count を増減（added=+1 / removed=-1）。
export async function applyHobbyDelta(added: string[], removed: string[]): Promise<void> {
  const db = getAdminDb() as any;
  if (!db) return;
  const bump = async (name: string, delta: number) => {
    const nm = normalizeHobby(name);
    if (!nm) return;
    const ref = db.collection(COL).doc(hobbyDocId(nm));
    try {
      const snap = await ref.get();
      const cur = snap.exists ? Number(snap.data()?.count || 0) : 0;
      const next = Math.max(0, cur + delta);
      await ref.set({ name: nm, count: next, updatedAt: Date.now() }, { merge: true });
    } catch { /* best-effort */ }
  };
  for (const t of added) await bump(t, +1);
  for (const t of removed) await bump(t, -1);
}

// 運営が不適切タグを削除。台帳から消し、全ユーザーの hobbies からも取り除く（best-effort）。
export async function deleteHobbyTag(name: string): Promise<{ removedFromUsers: number }> {
  const db = getAdminDb() as any;
  if (!db) return { removedFromUsers: 0 };
  const nm = normalizeHobby(name);
  try { await db.collection(COL).doc(hobbyDocId(nm)).delete(); } catch {}
  let removedFromUsers = 0;
  try {
    const snap = await db.collection('users').where('hobbies', 'array-contains', nm).limit(1000).get();
    for (const d of snap.docs) {
      const cur: string[] = Array.isArray(d.data()?.hobbies) ? d.data().hobbies : [];
      const next = cur.filter((h) => normalizeHobby(h) !== nm);
      if (next.length !== cur.length) {
        await d.ref.set({ hobbies: next, updatedAt: Date.now() }, { merge: true });
        removedFromUsers++;
      }
    }
  } catch { /* best-effort */ }
  return { removedFromUsers };
}
