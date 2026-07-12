import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { Round, SchedulePoll, ScheduleOption, ScheduleResponse, ScheduleAnswer } from '@/lib/types';

// 「調整さん」風の日程調整API。round.schedulePoll を1本のオブジェクトとして
// 読み込み→加工→丸ごと書き戻す（options / responses は配列なので merge でも
// 要素の追加・削除・更新が安全に反映される）。
//
// POST body: { action, ... }
//   enable        主催者のみ。ポールを初期化（任意で初期候補日 options[]）。
//   add-option    登録ユーザー誰でも。候補日を1つ追加 { date, startTime? }。
//   remove-option 追加者本人 or 主催者。{ optionId }。
//   answer        登録ユーザー誰でも。自分の回答を保存 { answers, comment? }。
//   decide        主催者のみ。候補日を決定し round に反映
//                 { optionId, courseMode: 'flexible'|'confirmed', courseName?, startTime? }。

const noStore = { 'Cache-Control': 'no-store' };
const VALID_ANSWER = new Set<ScheduleAnswer>(['ok', 'maybe', 'no']);
const MAX_OPTIONS = 30;

// Firestore は undefined を含むオブジェクトを拒否する。JSON往復で undefined を落として
// 安全な素のデータにする（値はプレーンな配列/文字列/数値のみ）。
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function emptyPoll(meId: string): SchedulePoll {
  return { createdBy: meId, createdAt: Date.now(), options: [], responses: [], decidedOptionId: null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const action = String(body.action || '');
  const isHost = round.hostId === meId;

  // 既存ポール（なければ空）を作業コピーとして取り出す。
  const poll: SchedulePoll = round.schedulePoll
    ? { ...round.schedulePoll, options: [...(round.schedulePoll.options || [])], responses: [...(round.schedulePoll.responses || [])] }
    : emptyPoll(meId);

  const patch: Partial<Round> = {};

  switch (action) {
    case 'enable': {
      if (!isHost) return NextResponse.json({ error: 'forbidden', message: '主催者のみ日程調整を開始できます' }, { status: 403, headers: noStore });
      if (round.schedulePoll) {
        // すでに存在。冪等に現状を返す。
        return NextResponse.json({ round }, { headers: noStore });
      }
      const opts = Array.isArray(body.options) ? body.options : [];
      const built: ScheduleOption[] = [];
      for (const o of opts.slice(0, MAX_OPTIONS)) {
        const date = String(o?.date || '').trim().slice(0, 40);
        if (!date) continue;
        const startTime = o?.startTime ? String(o.startTime).trim().slice(0, 20) : undefined;
        built.push(clean({ id: genId('sopt'), date, startTime, createdBy: meId, createdAt: Date.now() }));
      }
      patch.schedulePoll = clean({ ...emptyPoll(meId), options: built });
      break;
    }

    case 'add-option': {
      if (!round.schedulePoll) {
        // 主催者以外が最初の候補日を足しにきたら、まず主催者だけがポールを開ける方針。
        if (!isHost) return NextResponse.json({ error: 'not_started', message: '主催者が日程調整を開始していません' }, { status: 400, headers: noStore });
      }
      const date = String(body.date || '').trim().slice(0, 40);
      if (!date) return NextResponse.json({ error: 'bad_date', message: '日付を入力してください' }, { status: 400, headers: noStore });
      if ((poll.options || []).length >= MAX_OPTIONS) {
        return NextResponse.json({ error: 'too_many', message: `候補日は最大${MAX_OPTIONS}件までです` }, { status: 400, headers: noStore });
      }
      const startTime = body.startTime ? String(body.startTime).trim().slice(0, 20) : undefined;
      poll.options.push(clean({ id: genId('sopt'), date, startTime, createdBy: meId, createdAt: Date.now() }));
      patch.schedulePoll = clean(poll);
      break;
    }

    case 'remove-option': {
      const optionId = String(body.optionId || '');
      const opt = (poll.options || []).find((o) => o.id === optionId);
      if (!opt) return NextResponse.json({ error: 'not_found', message: '候補日が見つかりません' }, { status: 404, headers: noStore });
      // 追加した本人か主催者だけが削除できる。
      if (!isHost && opt.createdBy !== meId) {
        return NextResponse.json({ error: 'forbidden', message: '自分が追加した候補日のみ削除できます' }, { status: 403, headers: noStore });
      }
      poll.options = poll.options.filter((o) => o.id !== optionId);
      // 各回答からもこの候補日を除去。
      poll.responses = (poll.responses || []).map((r) => {
        const { [optionId]: _drop, ...rest } = r.answers || {};
        return { ...r, answers: rest };
      });
      // 決定済みの候補日を消したら決定も解除。
      if (poll.decidedOptionId === optionId) { poll.decidedOptionId = null; poll.decidedAt = undefined; }
      patch.schedulePoll = clean(poll);
      break;
    }

    case 'answer': {
      if (!round.schedulePoll) return NextResponse.json({ error: 'not_started', message: '日程調整はまだ開始されていません' }, { status: 400, headers: noStore });
      const rawAnswers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      const validIds = new Set((poll.options || []).map((o) => o.id));
      const answers: Record<string, ScheduleAnswer> = {};
      for (const [optId, val] of Object.entries(rawAnswers)) {
        if (validIds.has(optId) && VALID_ANSWER.has(val as ScheduleAnswer)) answers[optId] = val as ScheduleAnswer;
      }
      const comment = body.comment ? String(body.comment).trim().slice(0, 200) : undefined;
      const entry: ScheduleResponse = clean({ userId: meId, answers, comment, updatedAt: Date.now() });
      const others = (poll.responses || []).filter((r) => r.userId !== meId);
      // 回答が空でコメントも無ければ、自分の回答を消す（配列から除外）。
      poll.responses = (Object.keys(answers).length === 0 && !comment) ? others : [...others, entry];
      patch.schedulePoll = clean(poll);
      break;
    }

    case 'decide': {
      if (!isHost) return NextResponse.json({ error: 'forbidden', message: '主催者のみ日程を決定できます' }, { status: 403, headers: noStore });
      if (!round.schedulePoll) return NextResponse.json({ error: 'not_started' }, { status: 400, headers: noStore });
      const optionId = String(body.optionId || '');
      const opt = (poll.options || []).find((o) => o.id === optionId);
      if (!opt) return NextResponse.json({ error: 'not_found', message: '候補日が見つかりません' }, { status: 404, headers: noStore });
      const courseMode: 'flexible' | 'confirmed' = body.courseMode === 'confirmed' ? 'confirmed' : 'flexible';
      const courseName = body.courseName ? String(body.courseName).trim().slice(0, 80) : '';
      if (courseMode === 'confirmed' && !courseName) {
        return NextResponse.json({ error: 'need_course', message: 'コース確定にはゴルフ場名が必要です' }, { status: 400, headers: noStore });
      }
      // 決定を記録。
      poll.decidedOptionId = optionId;
      poll.decidedAt = Date.now();
      patch.schedulePoll = clean(poll);
      // 決まった日付を募集本体へ反映。
      patch.dateType = 'fixed';
      patch.date = opt.date;
      const startTime = body.startTime ? String(body.startTime).trim().slice(0, 20) : (opt.startTime || '');
      patch.startTime = startTime || undefined;
      patch.type = courseMode;
      if (courseMode === 'confirmed') {
        patch.courseName = courseName;
      }
      break;
    }

    default:
      return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
  }

  try {
    await db.updateRound(params.id, patch);
    const updated = await db.getRound(params.id);
    return NextResponse.json({ round: updated }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/rounds/[id]/schedule] failed', action, msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
