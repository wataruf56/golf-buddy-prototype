'use client';

import { useEffect, useRef, useState } from 'react';
import type { SwingSnapshot } from '@/types/swing';
import { detectPose } from '@/lib/poseDetector';
import { resolveBodyPart, pointForResolver, type Point } from '@/lib/poseLandmarks';

const SUBJECT_LABEL: Record<SwingSnapshot['subject'], string> = {
  pro: 'プロ',
  past: '前回',
  range: '練習場',
  round: 'ラウンド本番',
  mine: 'あなた',
};

const SUBJECT_TINT: Record<SwingSnapshot['subject'], string> = {
  pro: 'bg-blue text-white',
  past: 'bg-purple-500 text-white',
  range: 'bg-emerald-600 text-white',
  round: 'bg-orange text-white',
  mine: 'bg-green text-white',
};

type Props = {
  videoUrl: string;
  snapshot: SwingSnapshot;
};

// Renders a single video frame at snapshot.timeSec with an overlaid circle
// on the AI-flagged body part.
//
// v3 strategy:
//   1. Seek the off-screen <video> to snapshot.timeSec, draw the frame to a
//      hidden canvas.
//   2. Run MediaPipe Pose Landmarker on the frame to detect 33 body keypoints.
//   3. Map snapshot.bodyPart (e.g. "右肘") to the relevant landmark index via
//      lib/poseLandmarks.ts and draw the red circle there.
//   4. Fallback chain if any step fails:
//        - body part not in our vocabulary → fall back to AI-supplied x/y
//          (legacy v2 data) if present
//        - no AI x/y → render the frame with no circle, just caption
//      So the user always sees a useful image even if detection misses.
export function AnnotatedSnapshot({ videoUrl, snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [usedDetection, setUsedDetection] = useState<'pose' | 'ai-coords' | 'none'>('none');

  useEffect(() => {
    if (!videoUrl) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const cleanup = () => {
      try { video.removeAttribute('src'); video.load(); } catch {}
    };

    const draw = async () => {
      if (cancelled) { cleanup(); return; }
      const canvas = canvasRef.current;
      if (!canvas) { cleanup(); return; }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) { cleanup(); return; }
      // Cap to keep paint work down on phones. We scale the source frame
      // before any pose detection so the model sees the same pixels we'll
      // draw, keeping coordinates consistent.
      const maxW = 720;
      const scale = w > maxW ? maxW / w : 1;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { cleanup(); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Decide where the circle goes.
      let target: Point | null = null;
      let resolution: 'pose' | 'ai-coords' | 'none' = 'none';

      const resolver = resolveBodyPart(snapshot.bodyPart);
      if (resolver) {
        try {
          // Run pose detection on the rendered canvas (already scaled).
          const landmarks = await detectPose(canvas);
          if (cancelled) { cleanup(); return; }
          if (landmarks) {
            const p = pointForResolver(resolver, landmarks);
            if (p) { target = p; resolution = 'pose'; }
          }
        } catch {/* fall through */}
      }
      // Fallback to AI-supplied coords (legacy v2 data) if pose failed.
      if (!target && typeof snapshot.x === 'number' && typeof snapshot.y === 'number') {
        target = { x: snapshot.x, y: snapshot.y };
        resolution = 'ai-coords';
      }

      if (target) {
        const cx = target.x * canvas.width;
        const cy = target.y * canvas.height;
        const r = Math.max(canvas.width, canvas.height) * 0.06;
        // Solid red ring + dark halo so it shows on light/dark frames.
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = Math.max(2, r * 0.12);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      setUsedDetection(resolution);
      setReady(true);
      cleanup();
    };

    const onSeeked = () => { void draw(); };
    const onLoaded = () => {
      const target = Math.max(0, Math.min(snapshot.timeSec, Math.max(0, (video.duration || 0) - 0.05)));
      try { video.currentTime = target; } catch {
        setTimeout(() => { try { video.currentTime = target; } catch {} }, 100);
      }
    };
    const onError = () => { if (!cancelled) setErr('動画フレームを取得できませんでした'); cleanup(); };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      cleanup();
    };
    // We intentionally re-render when bodyPart / x / y change so a refreshed
    // snapshot list (e.g. from prop updates) gets re-detected.
  }, [videoUrl, snapshot.timeSec, snapshot.bodyPart, snapshot.x, snapshot.y]);

  return (
    <div className="bg-card rounded-xl overflow-hidden shadow-card">
      <div className="relative bg-black aspect-video flex items-center justify-center">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xs">読み込み中...</div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center text-red-300 text-xs px-3 text-center">{err}</div>
        )}
        <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${SUBJECT_TINT[snapshot.subject]}`}>
          {SUBJECT_LABEL[snapshot.subject]}
        </span>
        {snapshot.phase && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white">
            {snapshot.phase}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="text-[11px] font-bold text-sub mb-0.5">
          {snapshot.bodyPart ? `📍 ${snapshot.bodyPart}` : '📍 注目ポイント'}
          <span className="ml-2 text-[10px] text-muted font-normal">{snapshot.timeSec.toFixed(1)}s</span>
          {ready && usedDetection === 'none' && snapshot.bodyPart && (
            <span className="ml-2 text-[10px] text-muted font-normal">(自動検出できず)</span>
          )}
        </div>
        <div className="text-[12px] text-text leading-relaxed">{snapshot.caption || '—'}</div>
      </div>
    </div>
  );
}
