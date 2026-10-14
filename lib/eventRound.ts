// イベント（ラウンド以外：飲み会・シミュレーションゴルフ・練習会・観戦など）の共通定義（2026-10-14）。
// 画面とサーバーの両方で使う。データは Round（eventType='drink' ＋ eventKind）に載せる。
// eventType='drink' の分岐（ゴルフ場・組み分け・送迎・レビューなし）は今までどおり効く。
import type { EventKind, EventQuestion, PayMethod, Round, EventAnswer } from './types';

export const EVENT_KINDS: { key: EventKind; emoji: string; label: string }[] = [
  { key: 'drink', emoji: '🍻', label: '飲み会' },
  { key: 'simgolf', emoji: '🖥️', label: 'シミュゴル' },
  { key: 'practice', emoji: '🏌️', label: '練習会' },
  { key: 'watch', emoji: '📺', label: '観戦' },
  { key: 'other', emoji: '✨', label: 'その他' },
];
export const eventKindMeta = (k?: EventKind | null) => EVENT_KINDS.find((x) => x.key === k) || EVENT_KINDS[0];
export const isEventKind = (k: any): k is EventKind => EVENT_KINDS.some((x) => x.key === k);

/** 新しいイベント（出欠＋質問の集計つき）か。従来の飲み会募集（eventKind なし）は false。 */
export const isEventRound = (r: Partial<Round> | null | undefined): boolean => !!r && r.eventType === 'drink' && !!r.eventKind;

export const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: '当日現金' },
  { key: 'paypay', label: 'PayPay' },
  { key: 'transfer', label: '事前に振込' },
  { key: 'app', label: 'アプリで事前集金' },
  { key: 'other', label: 'その他' },
];
export const payMethodsLabel = (ms?: PayMethod[]) => (ms || []).map((m) => PAY_METHODS.find((x) => x.key === m)?.label).filter(Boolean).join('・');

export const EVENT_TITLE_PRESETS: Record<EventKind, string[]> = {
  drink: ['ゴルファー飲み会🍻', 'ゴルフ好きの忘年会🍻', 'ラウンド後の打ち上げ🍺', 'ゴルフ仲間の新年会🎍'],
  simgolf: ['シミュレーションゴルフ会🖥️', '雨の日シミュゴル⛳', '仕事帰りにシミュゴル🖥️'],
  practice: ['打ちっぱなし練習会🏌️', 'アプローチ・パター練習会⛳', '初心者向け練習会🔰'],
  watch: ['ゴルフ観戦に行こう📺', 'トーナメント観戦⛳', 'みんなで中継を見る会📺'],
  other: ['ゴルフ仲間の集まり✨'],
};

let qseq = 0;
export const newQuestionId = () => `q${Date.now().toString(36)}${(qseq++).toString(36)}`;

/** 種類ごとのおすすめ質問（作る画面で最初から入れておく・消せる・書き換えられる）。 */
export function presetQuestions(k: EventKind): EventQuestion[] {
  const q = (text: string, options?: string[], multi = false): EventQuestion =>
    ({ id: newQuestionId(), text, kind: options ? 'choice' : 'text', ...(options ? { options, multi } : {}), required: false });
  switch (k) {
    case 'drink': return [q('二次会は？', ['行く', '行かない', '未定']), q('食べられないもの（あれば）')];
    case 'simgolf': return [q('打席の希望時間は？', ['18:00〜', '19:00〜', '20:00〜'], true), q('レンタルクラブは？', ['借りたい', '自分のを持っていく'])];
    case 'practice': return [q('いまのレベルは？', ['はじめたばかり', '100前後', '90前後', '80台以下'])];
    case 'watch': return [q('交通手段は？', ['車', '電車', '未定'])];
    default: return [];
  }
}

/** 質問を整える（サーバー側。空・長すぎ・選択肢なしを落とす）。 */
export function sanitizeQuestions(raw: any): EventQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: EventQuestion[] = [];
  for (const x of raw.slice(0, 10)) {
    const text = String(x?.text || '').trim().slice(0, 80);
    if (!text) continue;
    const kind: 'choice' | 'text' = x?.kind === 'text' ? 'text' : 'choice';
    const id = String(x?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || newQuestionId();
    if (kind === 'choice') {
      const options = Array.from(new Set<string>((Array.isArray(x?.options) ? x.options : []).map((o: any) => String(o || '').trim().slice(0, 30)).filter(Boolean))).slice(0, 12);
      if (options.length < 2) continue;
      out.push({ id, text, kind, options, multi: !!x?.multi, required: !!x?.required });
    } else {
      out.push({ id, text, kind, required: !!x?.required });
    }
  }
  return out;
}

export type EventTally = {
  yes: number; maybe: number; no: number; unanswered: number;
  dates: Record<string, { ok: number; maybe: number; no: number }>;
  questions: Record<string, { counts: Record<string, number>; texts: string[] }>;
};

/** 出欠・候補日・質問の集計。unansweredIds＝答えていない招待中の人。 */
export function tallyEvent(r: Pick<Round, 'eventAnswers' | 'eventDateOptions' | 'eventQuestions'>, unansweredIds: string[] = []): EventTally {
  const t: EventTally = { yes: 0, maybe: 0, no: 0, unanswered: unansweredIds.length, dates: {}, questions: {} };
  for (const o of r.eventDateOptions || []) t.dates[o.id] = { ok: 0, maybe: 0, no: 0 };
  for (const q of r.eventQuestions || []) t.questions[q.id] = { counts: Object.fromEntries((q.options || []).map((o) => [o, 0])), texts: [] };
  for (const a of Object.values(r.eventAnswers || {}) as EventAnswer[]) {
    if (!a) continue;
    if (a.status === 'yes') t.yes++; else if (a.status === 'maybe') t.maybe++; else if (a.status === 'no') t.no++;
    for (const [id, v] of Object.entries(a.dates || {})) if (t.dates[id] && (v === 'ok' || v === 'maybe' || v === 'no')) t.dates[id][v]++;
    if (a.status === 'no') continue;   // 行けない人の質問の答えは数えない
    for (const q of r.eventQuestions || []) {
      const v = a.answers?.[q.id];
      if (v == null) continue;
      if (q.kind === 'choice') for (const o of (Array.isArray(v) ? v : [v])) { if (o in t.questions[q.id].counts) t.questions[q.id].counts[o]++; }
      else if (String(v).trim()) t.questions[q.id].texts.push(String(v).trim());
    }
  }
  return t;
}
