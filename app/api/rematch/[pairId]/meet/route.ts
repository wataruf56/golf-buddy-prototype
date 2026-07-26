import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSession, saveSession, membersOfPair } from '@/lib/rematch';
import { MEET_KEYS } from '@/lib/meetOptions';

// POST /api/rematch/[pairId]/meet  body: { types: string[] }  (lib/meetOptions の key)
// 「会い方」の希望（二人でラウンド/カフェ/ご飯 など。複数可＝〜でもいい）を自分側に保存し、
// 相手へ通知＋2人のDMに設定内容を投稿する（画面内チャットに履歴として残る）。
// romanticマッチ向け：「気になるけどまだ二人では会いたくない」に対応するための軽い選択肢。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });
  if ((s.optedOutBy || []).includes(meId)) return NextResponse.json({ error: 'opted_out' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  // 定義順を保ちつつ、既知のkeyだけに正規化。
  const set = new Set((Array.isArray(body?.types) ? body.types : []).map((x: any) => String(x)));
  const types: string[] = MEET_KEYS.filter((k) => set.has(k));

  const isA = s.userA === meId;
  await saveSession(pairId, { [isA ? 'meetPrefA' : 'meetPrefB']: types } as any);

  // 会い方の希望は「黙って保存」する。チャット投稿も通知（お知らせ／LINE/Web push）も出さない。
  // 相手は再会画面を開いたときに、グレー表示で相手の選択を確認できる（低頻度の希望共有のため
  // 都度の通知は不要、という方針）。日程の「候補日を送る」「この日で決定」は従来どおり通知する。
  return NextResponse.json({ ok: true, myMeet: types }, { headers: noStore });
}
