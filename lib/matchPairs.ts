import 'server-only';
import { getAdminDb } from './firebase';

// 「お互いが選び合っている相手（＝マッチ）」を**まとめて**引く。
//
// _matchLikes は docId=`${kind}__${from}__${to}` の片方向の記録なので、
// マッチかどうかは往復2件を見る必要がある。相手ごとに2回読むと
// 一覧表示（DMの可否判定）で読み取り回数が跳ね上がるため、
//   ・自分が押したもの（from == me）
//   ・自分に押されたもの（to == me）
// の2クエリだけ投げて、その積を取る。
//
// kind は 'again'（また回りたい）と 'romantic'（異性として気になる）。
// romantic を押すと again も同時にONになる運用なので、
// **again の相互だけ見ればどちらのマッチも拾える**。

export type MatchKind = 'again' | 'romantic';

/** meId とマッチしている相手のID集合。kind 省略時は again（＝両方を含む）。 */
export async function mutualMatchSet(meId: string, kind: MatchKind = 'again'): Promise<Set<string>> {
  const out = new Set<string>();
  const adb = getAdminDb() as any;
  if (!adb || !meId) return out;
  try {
    const [mineSnap, theirsSnap] = await Promise.all([
      adb.collection('_matchLikes').where('kind', '==', kind).where('from', '==', meId).limit(2000).get(),
      adb.collection('_matchLikes').where('kind', '==', kind).where('to', '==', meId).limit(2000).get(),
    ]);
    const mine = new Set<string>();
    mineSnap.docs.forEach((d: any) => { const t = d.data()?.to; if (t) mine.add(t); });
    theirsSnap.docs.forEach((d: any) => { const f = d.data()?.from; if (f && mine.has(f)) out.add(f); });
  } catch (e) {
    // 複合インデックスが無い環境向け：docId から復元する。
    // docId は `${kind}__${from}__${to}` なので、前方一致で引ける。
    try {
      const snap = await adb.collection('_matchLikes').limit(8000).get();
      const mine = new Set<string>(); const theirs = new Set<string>();
      snap.docs.forEach((d: any) => {
        const [k, f, t] = String(d.id).split('__');
        if (k !== kind) return;
        if (f === meId && t) mine.add(t);
        if (t === meId && f) theirs.add(f);
      });
      theirs.forEach((x) => { if (mine.has(x)) out.add(x); });
    } catch { /* 取れなければ空で返す（＝DMは他の条件だけで判定される） */ }
  }
  return out;
}
