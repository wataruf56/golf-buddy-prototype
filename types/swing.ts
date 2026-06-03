// Swing analysis types — kept narrow on purpose. Mirrors the spec section 5-2.

export type SwingMode = 'self' | 'compare' | 'past' | 'range_vs_round' | 'question';

export type SwingStatus = 'queued' | 'analyzing' | 'done' | 'failed';

export type SwingDoc = {
  swingId: string;
  userId: string;
  status: SwingStatus;
  mode: SwingMode;

  // Video paths in GCS (gs://golf-ai-line-videos/...)
  videoGcsPath?: string;       // self / question / "今回" (past) / "自分" (compare) / "ラウンド" (range_vs_round)
  proGcsPath?: string;         // compare: pro reference video
  prevGcsPath?: string;        // past: previous swing video
  rangeGcsPath?: string;       // range_vs_round: 練習場でのスイング

  userMessage?: string;        // free-text (required for question mode)

  reviewText?: string;         // raw analyzer output
  reviewTextChunks?: string[]; // pre-split for UI

  // Optional structured snapshots emitted by the AI for the visual
  // "ここに注目" comparison feature. Parsed out of reviewText by the
  // worker — see lib/swingSnapshots.ts. Kept on the doc so the UI can
  // render annotated screenshots without re-parsing every render.
  snapshots?: SwingSnapshot[];

  // Structured scoring emitted by the AI (parsed out of reviewText by the
  // worker — see lib/swingScore.ts). Powers the score-trend graph and the
  // per-axis "課題の改善" bars on the swing tab. Only present on analyses run
  // after this feature shipped.
  swingScore?: number;                 // overall 0-100
  swingAxes?: { label: string; value: number }[]; // fixed rubric axes, each 0-100

  videoDeleted?: boolean;
  errorMessage?: string;
  retryCount?: number;
  analysisRunId?: string;

  // Reserved for future Stripe integration. All current docs: "free".
  billingPlanSnapshot?: 'free' | 'paid';

  createdAt: number;           // Date.now()
  updatedAt: number;
  startedAnalyzingAt?: number;
  completedAt?: number;
};

export type SwingUploadRole = 'video' | 'pro' | 'prev' | 'range';

// One annotated frame the AI flagged as worth visualising.
//   subject  → which video to seek into ("自分" / "プロ" / "過去" / "練習場" / "ラウンド")
//   timeSec  → absolute seconds from video start (e.g. 1.8)
//   phase    → human-readable phase label (e.g. "トップ")
//   bodyPart → focal area (e.g. "右肘")
//   x, y     → optional normalised coordinates (0..1) of where to draw the
//              circle. If absent the UI just shows the frame with a caption.
//   caption  → short note shown beside the snapshot
export type SwingSnapshot = {
  subject: 'mine' | 'pro' | 'past' | 'range' | 'round';
  timeSec: number;
  phase?: string;
  bodyPart?: string;
  x?: number;
  y?: number;
  caption: string;
};
