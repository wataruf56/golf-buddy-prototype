// Swing analysis types — kept narrow on purpose. Mirrors the spec section 5-2.

export type SwingMode = 'self' | 'compare' | 'past' | 'question';

export type SwingStatus = 'queued' | 'analyzing' | 'done' | 'failed';

export type SwingDoc = {
  swingId: string;
  userId: string;
  status: SwingStatus;
  mode: SwingMode;

  // Video paths in GCS (gs://golf-ai-line-videos/...)
  videoGcsPath?: string;       // self / question / "今回" (past) / "自分" (compare)
  proGcsPath?: string;         // compare: pro reference video
  prevGcsPath?: string;        // past: previous swing video

  userMessage?: string;        // free-text (required for question mode)

  reviewText?: string;         // raw analyzer output
  reviewTextChunks?: string[]; // pre-split for UI

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

export type SwingUploadRole = 'video' | 'pro' | 'prev';
