'use client';

import type { SwingSnapshot } from '@/types/swing';
import { pairSnapshots } from '@/lib/swingSnapshots';
import { AnnotatedSnapshot } from './AnnotatedSnapshot';

// Renders the AI-flagged "ここに注目" snapshots as side-by-side pairs (or
// solo cards in single-video modes). Each card extracts a single frame
// from the relevant video and overlays a circle on the body part the AI
// pointed at — gives users a visual diff in addition to the text review.

type Props = {
  snapshots: SwingSnapshot[];
  videos: Partial<Record<SwingSnapshot['subject'], string>>;
};

export function SnapshotGallery({ snapshots, videos }: Props) {
  if (!snapshots?.length) return null;
  const pairs = pairSnapshots(snapshots);
  return (
    <div className="bg-card rounded-card p-4 shadow-card mt-3">
      <div className="text-sm font-black mb-1 flex items-center gap-1.5">
        <span>📸</span><span>ここに注目</span>
      </div>
      <div className="text-[11px] text-sub mb-3">
        AIコーチが特に重要と判定したフレームを切り出して、注目部位に丸印を付けています。
      </div>
      <div className="flex flex-col gap-3">
        {pairs.map((p, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SnapCard videos={videos} snap={p.left} />
            {p.right && <SnapCard videos={videos} snap={p.right} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SnapCard({ snap, videos }: { snap: SwingSnapshot; videos: Props['videos'] }) {
  const url = videos[snap.subject];
  if (!url) {
    // The AI named a subject we don't have a video for — fall back to a
    // text-only card so the caption still surfaces.
    return (
      <div className="bg-bg rounded-xl p-3">
        <div className="text-[11px] font-bold text-sub mb-1">📍 {snap.bodyPart || '注目ポイント'} ({snap.phase || ''})</div>
        <div className="text-[12px] text-text">{snap.caption}</div>
      </div>
    );
  }
  return <AnnotatedSnapshot videoUrl={url} snapshot={snap} />;
}
