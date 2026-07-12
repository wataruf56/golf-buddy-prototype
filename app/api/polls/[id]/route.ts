import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { SchedulePoll, ScheduleOption, ScheduleResponse, ScheduleAnswer } from '@/lib/types';

// 独立した日程調整ポールの取得・操作。
//
// GET  /api/polls/[id]              公開。{ poll, users }（回答者の名前・アバター用）
// POST /api/polls/[id] { action }
//   add-option    登録ユーザー誰でも。候補日を追加 { date, startTime? }
//   remove-option 追加者本人 or オーナー。{ optionId }
//   answer        登録ユーザー誰でも。自分の回答を保存 { answers, comment? }
//   decide        オーナーのみ。候補日を決定 { optionId }
//   link-round    オーナーのみ。作成した募集を紐付け { roundId }

const noStore = { 'Cache-Control': 'no-store' };
const VALID_ANSWER = new Set<ScheduleAnswer>(['ok', 'maybe', 'no']);
const MAX_OPTIONS = 30;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
function clean<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const poll = await db.getPoll(params.id);
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  // 回答者＋オーナーの表示情報（名前・アバター）を同梱。実名などの非公開情報は除去。
  const ids = new Set<string>([poll.ownerId]);
  for (const r of poll.responses || []) ids.add(r.userId);
  const users = await db.listUsers(Array.from(ids));
  const { stripPrivateMany } = await import('@/lib/sanitizeUser');
  return NextResponse.json({ poll, users: stripPrivateMany(users, null) }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  const stored = await db.getPoll(params.id);
  if (!stored) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const action = String(body.action || '');
  const isOwner = stored.ownerId === meId;

  // 作業コピー（配列は複製）。
  const poll: SchedulePoll = {
    ...stored,
    options: [...(stored.options || [])],
    responses: [...(stored.responses || [])],
  };

  switch (action) {
    case 'add-option': {
      const date = String(body.date || '').trim().slice(0, 40);
      if (!date) return NextResponse.json({ error: 'bad_date', message: '日付を入力してください' }, { status: 400, headers: noStore });
      if ((poll.options || []).length >= MAX_OPTIONS) {
        return NextResponse.json({ error: 'too_many', message: `候補日は最大${MAX_OPTIONS}件までです` }, { status: 400, headers: noStore });
      }
      const startTime = body.startTime ? String(body.startTime).trim().slice(0, 20) : undefined;
      const opt: ScheduleOption = clean({ id: genId('sopt'), date, startTime, createdBy: meId, createdAt: Date.now() });
      poll.options.push(opt);
      break;
    }

    case 'add-options': {
      // 複数の候補日を一括追加（カレンダーでまとめて選択 → 一気に追加）。
      const dates: unknown[] = Array.isArray(body.dates) ? body.dates : [];
      const startTime = body.startTime ? String(body.startTime).trim().slice(0, 20) : undefined;
      // 既存と重複する（同じ日付＋同じ時間）候補はスキップ。
      const seen = new Set((poll.options || []).map((o) => `${o.date}|${o.startTime || ''}`));
      let added = 0;
      let idx = 0;
      for (const raw of dates) {
        if ((poll.options || []).length >= MAX_OPTIONS) break;
        const date = String(raw || '').trim().slice(0, 40);
        if (!date) continue;
        const key = `${date}|${startTime || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const opt: ScheduleOption = clean({ id: `${genId('sopt')}${idx++}`, date, startTime, createdBy: meId, createdAt: Date.now() });
        poll.options.push(opt);
        added++;
      }
      if (added === 0) return NextResponse.json({ error: 'no_dates', message: '追加できる日付がありません（重複または上限）' }, { status: 400, headers: noStore });
      break;
    }

    case 'remove-option': {
      const optionId = String(body.optionId || '');
      const opt = (poll.options || []).find((o) => o.id === optionId);
      if (!opt) return NextResponse.json({ error: 'not_found', message: '候補日が見つかりません' }, { status: 404, headers: noStore });
      if (!isOwner && opt.createdBy !== meId) {
        return NextResponse.json({ error: 'forbidden', message: '自分が追加した候補日のみ削除できます' }, { status: 403, headers: noStore });
      }
      poll.options = poll.options.filter((o) => o.id !== optionId);
      poll.responses = (poll.responses || []).map((r) => {
        const { [optionId]: _drop, ...rest } = r.answers || {};
        return { ...r, answers: rest };
      });
      if (poll.decidedOptionId === optionId) { poll.decidedOptionId = null; poll.decidedAt = undefined; }
      break;
    }

    case 'answer': {
      const rawAnswers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      const validIds = new Set((poll.options || []).map((o) => o.id));
      const answers: Record<string, ScheduleAnswer> = {};
      for (const [optId, val] of Object.entries(rawAnswers)) {
        if (validIds.has(optId) && VALID_ANSWER.has(val as ScheduleAnswer)) answers[optId] = val as ScheduleAnswer;
      }
      const comment = body.comment ? String(body.comment).trim().slice(0, 200) : undefined;
      const entry: ScheduleResponse = clean({ userId: meId, answers, comment, updatedAt: Date.now() });
      const others = (poll.responses || []).filter((r) => r.userId !== meId);
      poll.responses = (Object.keys(answers).length === 0 && !comment) ? others : [...others, entry];
      break;
    }

    case 'decide': {
      if (!isOwner) return NextResponse.json({ error: 'forbidden', message: '作成者のみ日程を決定できます' }, { status: 403, headers: noStore });
      const optionId = String(body.optionId || '');
      if (optionId && !(poll.options || []).some((o) => o.id === optionId)) {
        return NextResponse.json({ error: 'not_found', message: '候補日が見つかりません' }, { status: 404, headers: noStore });
      }
      poll.decidedOptionId = optionId || null;
      poll.decidedAt = optionId ? Date.now() : undefined;
      break;
    }

    case 'link-round': {
      if (!isOwner) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
      poll.roundId = body.roundId ? String(body.roundId) : undefined;
      break;
    }

    default:
      return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
  }

  // decidedOptionId は null を保持したいので undefined を弾く clean は使わず、必要な場を明示。
  const patch: Partial<SchedulePoll> = clean({
    options: poll.options,
    responses: poll.responses,
    decidedOptionId: poll.decidedOptionId ?? null,
    decidedAt: poll.decidedAt,
    roundId: poll.roundId,
  });

  try {
    await db.updatePoll(params.id, patch);
    const updated = await db.getPoll(params.id);
    return NextResponse.json({ poll: updated }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/polls/[id]] failed', action, msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
