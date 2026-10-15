import 'server-only';
import { getAdminDb } from '@/lib/firebase';

// 広告のA/Bテスト（画像違いの広告を同じ予算・期間で出して比べる）。
//
// コレクション adTests … 1件＝1テスト。中に案（variant）を2つ以上持つ。
//
// 数字の出どころは2つに分かれる:
//   広告側（表示回数・クリック・費用・プロフィールへのアクセス）
//     … Ads Manager にしか無い。Instagram API の投稿インサイトはオーガニックのみで広告分を返さないため。
//       → 管理画面で手入力して保存する。
//   LP側（来訪者・診断開始・完了・LINEへ・新規登録）
//     … 広告のリンク先に ?ref=<案ごとのタグ> を付けておけば、診断LPの計測（_lpQuiz）と
//       登録時の acquisitionSource から自動で出る。lp/quiz の「リンク別ファネル」と同じ数え方。

export type AdVariant = {
  key: string;          // 'a' 'b' …（テスト内で一意）
  label: string;        // 'X2' 'Z1' など
  ref: string;          // ?ref= に付けるタグ（英小文字・数字・-_ のみ）
  imageUrl?: string;
  impressions?: number | null;
  clicks?: number | null;        // Ads Manager の「リンクのクリック」
  spend?: number | null;         // 円
  profileVisits?: number | null; // Ads Manager の「Instagramプロフィールへのアクセス」
};

export type AdTest = {
  id: string;
  name: string;
  startDate: string;   // YYYY-MM-DD（JST）
  endDate: string;     // YYYY-MM-DD（JST）。空なら終わりを決めていない
  landing: string;     // リンク先のURL（?ref= を除いたもの）
  note?: string;
  variants: AdVariant[];
  createdAt: number;
  updatedAt: number;
};

export type Funnel = { visitors: number; starts: number; completes: number; ctas: number; registered: number };

const COL = 'adTests';
export const DEFAULT_LANDING = 'https://goltomo.com/golmoti.html';

function db(): any {
  const d = getAdminDb() as any;
  if (!d) throw new Error('firestore not initialized');
  return d;
}

export function normalizeRef(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
}

function num(v: any): number | null {
  if (v === '' || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanVariants(list: any[]): AdVariant[] {
  const seen = new Set<string>();
  const out: AdVariant[] = [];
  (Array.isArray(list) ? list : []).forEach((v, i) => {
    const ref = normalizeRef(v?.ref);
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    out.push({
      key: String(v?.key || String.fromCharCode(97 + i)).slice(0, 8),
      label: String(v?.label || ref).slice(0, 30),
      ref,
      imageUrl: String(v?.imageUrl || '').slice(0, 500),
      impressions: num(v?.impressions),
      clicks: num(v?.clicks),
      spend: num(v?.spend),
      profileVisits: num(v?.profileVisits),
    });
  });
  return out;
}

function toTest(id: string, d: any): AdTest {
  return {
    id,
    name: String(d?.name || ''),
    startDate: String(d?.startDate || ''),
    endDate: String(d?.endDate || ''),
    landing: String(d?.landing || DEFAULT_LANDING),
    note: String(d?.note || ''),
    variants: cleanVariants(d?.variants || []),
    createdAt: Number(d?.createdAt || 0),
    updatedAt: Number(d?.updatedAt || 0),
  };
}

export async function listAdTests(): Promise<AdTest[]> {
  const snap = await db().collection(COL).orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map((s: any) => toTest(s.id, s.data()));
}

export async function createAdTest(input: Partial<AdTest>): Promise<AdTest> {
  const variants = cleanVariants(input.variants || []);
  // 案が1つでも作れる（まず1案だけ出して数字を貯め、あとから候補を足して比べる使い方）。
  if (variants.length < 1) throw new Error('案を1つ以上入れてください');
  const now = Date.now();
  const doc = {
    name: String(input.name || '').slice(0, 60) || '名前なしのテスト',
    startDate: String(input.startDate || '').slice(0, 10),
    endDate: String(input.endDate || '').slice(0, 10),
    landing: String(input.landing || DEFAULT_LANDING).slice(0, 300),
    note: String(input.note || '').slice(0, 500),
    variants,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await db().collection(COL).add(doc);
  return toTest(ref.id, doc);
}

export async function updateAdTest(id: string, patch: Partial<AdTest>): Promise<void> {
  const cur = await db().collection(COL).doc(id).get();
  if (!cur.exists) throw new Error('テストが見つかりません');
  const out: any = { updatedAt: Date.now() };
  for (const k of ['name', 'startDate', 'endDate', 'landing', 'note'] as const) {
    if (typeof patch[k] === 'string') out[k] = String(patch[k]).slice(0, k === 'note' ? 500 : 300);
  }
  if (Array.isArray(patch.variants)) {
    // タグ（ref）は途中で変えると計測が切れるので、保存済みの案のタグは変えさせない。
    // ・送られてきた中に無い保存済みの案は消す（「この案を外す」）
    // ・key の無い新しい案は末尾に足す（「案を足す」）。タグが既存と重なるものは捨てる
    const old = toTest(id, cur.data()).variants;
    const byKey = new Map(patch.variants.filter((v: any) => v?.key).map((v: any) => [String(v.key), v]));
    const kept = old.filter((o) => byKey.has(o.key))
      .map((o) => ({ ...o, ...(byKey.get(o.key) || {}), ref: o.ref, key: o.key }));
    const used = new Set(kept.map((v) => v.key));
    let n = 0;
    const nextKey = () => { while (used.has('v' + n)) n++; used.add('v' + n); return 'v' + n; };
    const added = patch.variants.filter((v: any) => !v?.key).map((v: any) => ({ ...v, key: nextKey() }));
    const merged = cleanVariants([...kept, ...added]);
    if (!merged.length) throw new Error('案が1つも残りません。テストごと削除してください');
    out.variants = merged;
  }
  await db().collection(COL).doc(id).update(out);
}

export async function deleteAdTest(id: string): Promise<void> {
  await db().collection(COL).doc(id).delete();
}

const jstStart = (s: string) => (s ? Date.parse(s + 'T00:00:00+09:00') || 0 : 0);
const jstEnd = (s: string) => (s ? Date.parse(s + 'T23:59:59.999+09:00') || 0 : 0);

/** テストの期間・タグについて、診断LPの来訪〜登録を数える。
 *  数え方は /api/lp/quiz の「リンク別ファネル」と同じ（訪問者の最初の来訪のタグに帰属させる）。 */
export async function funnelsFor(t: AdTest): Promise<Record<string, Funnel>> {
  const refs = new Set(t.variants.map((v) => v.ref));
  const out: Record<string, Funnel> = {};
  t.variants.forEach((v) => { out[v.ref] = { visitors: 0, starts: 0, completes: 0, ctas: 0, registered: 0 }; });
  if (!refs.size) return out;

  const from = jstStart(t.startDate);
  const to = jstEnd(t.endDate);
  let q = db().collection('_lpQuiz').where('ts', '>=', from).orderBy('ts', 'asc');
  if (to) q = q.where('ts', '<=', to);
  const snap = await q.limit(20000).get();
  const docs = snap.docs.map((d: any) => d.data());

  const refOf: Record<string, string> = {};
  for (const d of docs) { // ts 昇順なので、最初に見つかった来訪のタグを採る
    if (d.event === 'visit' && d.visitorId && d.utmSource && !refOf[d.visitorId]) {
      refOf[d.visitorId] = String(d.utmSource).toLowerCase().slice(0, 40);
    }
  }
  const sets: Record<string, { v: Set<string>; s: Set<string>; c: Set<string>; l: Set<string> }> = {};
  for (const r of refs) sets[r] = { v: new Set(), s: new Set(), c: new Set(), l: new Set() };
  for (const d of docs) {
    const r = d.visitorId ? refOf[d.visitorId] : '';
    if (!r || !sets[r]) continue;
    if (d.event === 'visit') sets[r].v.add(d.visitorId);
    else if (d.event === 'start') sets[r].s.add(d.visitorId);
    else if (d.event === 'complete') sets[r].c.add(d.visitorId);
    else if (d.event === 'cta') sets[r].l.add(d.visitorId);
  }
  for (const r of refs) {
    out[r].visitors = sets[r].v.size; out[r].starts = sets[r].s.size;
    out[r].completes = sets[r].c.size; out[r].ctas = sets[r].l.size;
  }

  // 新規登録は登録時の ?ref= が users.acquisitionSource に残る。タグはテストごとに別なので期間は問わない。
  const refList = [...refs].slice(0, 30);
  const us = await db().collection('users').where('acquisitionSource', 'in', refList).select('acquisitionSource').get();
  us.docs.forEach((u: any) => {
    const s = String(u.data()?.acquisitionSource || '').toLowerCase();
    if (out[s]) out[s].registered++;
  });
  return out;
}
