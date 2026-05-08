import 'server-only';

// swing-analyzer Cloud Run client.
// POST <SWING_ANALYZER_URL>/analyze with x-shared-secret header.
// 30〜120s response time → caller must run inside the worker (not user-request path).

const RECOGNITION_FAILURE_PATTERNS = [
  '動画が送られてきません',
  '動画を確認できません',
  '動画が確認できません',
  '動画が提供されていません',
  '映像が確認できません',
  '動画ファイルが見つかりません',
  '動画を受け取っていません',
  '動画がありません',
  '動画データが含まれていません',
];

export type AnalyzeArgs = {
  gcsUri: string;
  gcsUri2?: string;
  prompt: string;
};

export class AnalyzerError extends Error {
  retryable: boolean;
  status: number;
  constructor(message: string, opts: { retryable: boolean; status: number }) {
    super(message);
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

export async function analyzeSwing(args: AnalyzeArgs): Promise<string> {
  const { gcsUri, gcsUri2, prompt } = args;
  const url = process.env.SWING_ANALYZER_URL || '';
  const secret = process.env.SWING_ANALYZER_SHARED_SECRET || '';
  if (!url) throw new AnalyzerError('SWING_ANALYZER_URL not set', { retryable: false, status: 0 });
  if (!secret) throw new AnalyzerError('SWING_ANALYZER_SHARED_SECRET not set', { retryable: false, status: 0 });
  if (!gcsUri) throw new AnalyzerError('gcsUri required', { retryable: false, status: 400 });
  if (!prompt || !prompt.trim()) throw new AnalyzerError('prompt required', { retryable: false, status: 400 });

  const body: Record<string, string> = { gcsUri, prompt };
  if (gcsUri2) body.gcsUri2 = gcsUri2;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-shared-secret': secret },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AnalyzerError(`network error: ${(e as Error).message}`, { retryable: true, status: 0 });
  }

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    // 5xx and 429 → retryable
    const retryable = res.status >= 500 || res.status === 429;
    throw new AnalyzerError(`analyzer ${res.status}: ${text.slice(0, 300)}`, { retryable, status: res.status });
  }

  if (!json?.ok) {
    throw new AnalyzerError(`analyzer returned ok=false: ${text.slice(0, 300)}`, { retryable: false, status: res.status });
  }

  // We always send `prompt` so the field is `answerText`.
  const out: string = String(json.answerText || '').trim();
  if (!out) throw new AnalyzerError('answerText empty', { retryable: true, status: res.status });

  for (const pat of RECOGNITION_FAILURE_PATTERNS) {
    if (out.includes(pat)) {
      throw new AnalyzerError(`Gemini could not read video: ${out.slice(0, 200)}`, { retryable: true, status: res.status });
    }
  }
  if (out.length < 100) {
    throw new AnalyzerError(`analyzer response too short (${out.length} chars)`, { retryable: true, status: res.status });
  }
  return out;
}
