'use client';

import { useEffect, useRef, useState } from 'react';
import type { SwingSnapshot } from '@/types/swing';

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
// at (snapshot.x, snapshot.y) — the AI-flagged "look-here" point. Frame
// extraction is done client-side: we set <video>.currentTime, wait for the
// "seeked" event, then draw the frame onto a canvas. No server-side ffmpeg.
//
// The circle is drawn relative to the rendered <canvas> so it scales with
// CSS sizing. If the AI didn't supply x/y we just render the bare frame
// with the caption — still useful as a visual cue.
export function AnnotatedSnapshot({ videoUrl, snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

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

    const draw = () => {
      if (cancelled) { cleanup(); return; }
      const canvas = canvasRef.current;
      if (!canvas) { cleanup(); return; }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) { cleanup(); return; }
      // Cap canvas to keep memory + paint work down on phones.
      const maxW = 720;
      const scale = w > maxW ? maxW / w : 1;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { cleanup(); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Overlay circle at normalised (x,y) when supplied.
      if (typeof snapshot.x === 'number' && typeof snapshot.y === 'number') {
        const cx = snapshot.x * canvas.width;
        const cy = snapshot.y * canvas.height;
        const r = Math.max(canvas.width, canvas.height) * 0.06;
        // Solid red ring + subtle dark halo so it shows on light/dark frames.
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#FF3B30';
        ctx.lineWidth = Math.max(2, r * 0.12);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      setReady(true);
      cleanup();
    };

    const onSeeked = () => draw();
    const onLoaded = () => {
      // Clamp to actual duration so absurd timestamps don't reject.
      const target = Math.max(0, Math.min(snapshot.timeSec, Math.max(0, (video.duration || 0) - 0.05)));
      try { video.currentTime = target; } catch {
        // Some browsers refuse currentTime before metadata; retry once.
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
  }, [videoUrl, snapshot.timeSec, snapshot.x, snapshot.y]);

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
        </div>
        <div className="text-[12px] text-text leading-relaxed">{snapshot.caption || '—'}</div>
      </div>
    </div>
  );
}
