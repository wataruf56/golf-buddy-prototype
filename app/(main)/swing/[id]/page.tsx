'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ReviewChunks } from '@/components/swing/ReviewChunks';
import { StatusBadge } from '@/components/swing/StatusBadge';
import { SnapshotGallery } from '@/components/swing/SnapshotGallery';
import { toast } from '@/components/Toast';
import type { SwingDoc, SwingSnapshot } from '@/types/swing';

const MODE_LABEL: Record<string, string> = {
  self: '🏌️ 自分のスイング解析',
  compare: '🆚 プロ比較',
  past: '📈 過去比較',
  range_vs_round: '🏟️ 練習場 vs ラウンド',
  question: '❓ 質問モード',
};

function gcsToPublicUrl(gcsUri?: string): string {
  if (!gcsUri || !gcsUri.startsWith('gs://')) return '';
  const stripped = gcsUri.replace(/^gs:\/\//, '');
  const idx = stripped.indexOf('/');
  if (idx < 0) return '';
  const bucket = stripped.slice(0, idx);
  const objectName = stripped.slice(idx + 1);
  return `https://storage.googleapis.com/${bucket}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
}

function VideoCard({ src, label }: { src: string; label: string }) {
  if (!src) return null;
  return (
    <div className="bg-card rounded-card p-3 shadow-card">
      <div className="text-[11px] font-bold text-sub mb-2">{label}</div>
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg bg-black"
      />
    </div>
  );
}

function SwingVideos({ swing }: { swing: SwingDoc }) {
  const main = gcsToPublicUrl(swing.videoGcsPath);
  const pro = gcsToPublicUrl(swing.proGcsPath);
  const prev = gcsToPublicUrl(swing.prevGcsPath);
  const range = gcsToPublicUrl((swing as any).rangeGcsPath);
  if (!main && !pro && !prev && !range) return null;

  // For compare/past/range_vs_round modes, show both with appropriate labels.
  const mainLabel =
    swing.mode === 'compare' ? '🎥 自分のスイング'
    : swing.mode === 'past' ? '🎥 今回のスイング'
    : swing.mode === 'range_vs_round' ? '🎥 ラウンド本番のスイング'
    : '🎥 スイング動画';

  return (
    <div className="flex flex-col gap-2.5 mb-4">
      {pro && <VideoCard src={pro} label="🎥 プロのお手本" />}
      {prev && <VideoCard src={prev} label="🎥 過去のスイング" />}
      {range && <VideoCard src={range} label="🎥 練習場でのスイング" />}
      {main && <VideoCard src={main} label={mainLabel} />}
    </div>
  );
}

// Map snapshot.subject → the corresponding video URL on this doc, so the
// SnapshotGallery can render an annotated frame from the right source.
function buildSnapshotVideoMap(swing: SwingDoc): Partial<Record<SwingSnapshot['subject'], string>> {
  return {
    mine: gcsToPublicUrl(swing.videoGcsPath),
    pro: gcsToPublicUrl(swing.proGcsPath),
    past: gcsToPublicUrl(swing.prevGcsPath),
    range: gcsToPublicUrl((swing as any).rangeGcsPath),
    round: gcsToPublicUrl(swing.videoGcsPath), // round_vs_range main = round
  };
}

export default function SwingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [swing, setSwing] = useState<SwingDoc | null>(null);
  const [err, setErr] = useState('');
  const stoppedRef = useRef(false);

  async function load() {
    try {
      const r = await fetch(`/api/swing/${params.id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setSwing(d.swing);
      if (d.swing?.status === 'done' || d.swing?.status === 'failed') {
        stoppedRef.current = true;
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!stoppedRef.current) load(); }, 5000);
    return () => clearInterval(t);
  }, [params.id]);

  if (!swing && !err) {
    return <div className="px-5 py-10 text-sm text-muted text-center">読み込み中...</div>;
  }
  if (err && !swing) {
    return <div className="px-5 py-10 text-sm text-red-600 text-center">エラー: {err}</div>;
  }
  if (!swing) return null;

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.push('/swing')} className="text-sm text-blue font-semibold mb-3">← 履歴に戻る</button>

      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-base font-black">{MODE_LABEL[swing.mode] || swing.mode}</div>
          <StatusBadge status={swing.status} />
        </div>
        <div className="text-[11px] text-muted">
          {new Date(swing.createdAt).toLocaleString('ja-JP')}
        </div>
        {swing.userMessage && (
          <div className="mt-3 p-3 bg-bg rounded-lg text-[12px] text-sub whitespace-pre-wrap">
            {swing.userMessage}
          </div>
        )}
      </div>

      <SwingVideos swing={swing} />

      {(swing.status === 'queued' || swing.status === 'analyzing') && (
        <AnalyzingCard swing={swing} />
      )}

      {swing.status === 'failed' && (
        <FailedCard swing={swing} onRetried={load} />
      )}

      {swing.status === 'done' && swing.reviewTextChunks && (
        <>
          <ReviewChunks chunks={swing.reviewTextChunks} />
          {swing.snapshots && swing.snapshots.length > 0 && (
            <SnapshotGallery snapshots={swing.snapshots} videos={buildSnapshotVideoMap(swing)} />
          )}
          <ShareCard swing={swing} />
        </>
      )}

      {(swing.status === 'done' || swing.status === 'failed') && (
        <DangerZone swing={swing} onDeleted={() => router.push('/swing')} />
      )}

      <div className="h-5" />
    </div>
  );
}

/** Shows the elapsed time since startedAnalyzingAt (or createdAt if not started yet). */
function AnalyzingCard({ swing }: { swing: SwingDoc }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startTs = swing.startedAnalyzingAt || swing.createdAt;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startTs) / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [swing.startedAnalyzingAt, swing.createdAt]);

  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const fmt = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  return (
    <div className="bg-card rounded-card p-8 text-center shadow-card">
      <div className="text-3xl mb-3 animate-pulse">⛳</div>
      <div className="text-sm font-bold mb-1">
        {swing.status === 'queued' ? '解析待機中...' : 'AIが解析中...'}
      </div>
      <div className="text-2xl font-mono font-black my-3 tracking-wider text-green">{fmt}</div>
      <div className="text-[11px] text-sub">通常1〜2分で完了します</div>
      <div className="text-[10px] text-muted mt-1">完了するとLINE通知が届きます</div>
    </div>
  );
}

function FailedCard({ swing, onRetried }: { swing: SwingDoc; onRetried: () => void }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      const r = await fetch(`/api/swing/${swing.swingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `${r.status}`);
      }
      toast('再キューしました。しばらくお待ちください');
      onRetried();
    } catch (e) {
      toast(`再試行失敗: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }
  const canRetry = !!swing.videoGcsPath; // need video still in GCS

  return (
    <div className="bg-red-50 border border-red-200 rounded-card p-4 text-center mb-4">
      <div className="text-sm font-bold text-red-600 mb-1">⚠️ 解析に失敗しました</div>
      {swing.errorMessage && (
        <div className="text-[11px] text-red-500 mb-3 break-words">{swing.errorMessage}</div>
      )}
      <div className="flex gap-2 mt-3">
        {canRetry && (
          <button
            onClick={retry}
            disabled={busy}
            className="flex-1 py-2.5 bg-orange text-white rounded-lg text-xs font-bold disabled:opacity-50"
          >{busy ? '再キュー中...' : '🔄 同じ動画でもう一度試す'}</button>
        )}
        <a
          href="/swing/new"
          className="flex-1 py-2.5 bg-green text-white rounded-lg text-xs font-bold inline-block text-center"
        >📹 新しく撮り直す</a>
      </div>
    </div>
  );
}

function ShareCard({ swing }: { swing: SwingDoc }) {
  const [copied, setCopied] = useState(false);
  // Public share URL — accessible WITHOUT LINE login. Friends can preview the
  // result, then sign up themselves via the CTA on the share page.
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.goltomo.com';
  const url = `${origin}/share/swing/${swing.swingId}`;
  const text = `⛳ AIコーチにスイング解析してもらった！\n\n${url}`;

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      toast('URLをコピーしました');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Native share sheet on iOS/Android — falls back to clipboard.
  async function nativeShare() {
    const w = window as any;
    if (w.navigator?.share) {
      try {
        await w.navigator.share({ title: 'Golf Buddy スイング解析', text, url });
      } catch { /* user canceled, that's fine */ }
    } else {
      copy();
    }
  }

  const lineShare = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;

  return (
    <div className="bg-card rounded-card p-4 shadow-card mt-4">
      <div className="text-[12px] font-bold mb-2.5">📤 この解析結果をシェア</div>
      <div className="flex gap-2">
        <a
          href={lineShare}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 bg-green text-white rounded-lg text-xs font-bold text-center"
        >LINEで送る</a>
        <button
          onClick={nativeShare}
          className="flex-1 py-2.5 bg-bg border-[1.5px] border-border rounded-lg text-xs font-bold"
        >他のアプリ</button>
        <button
          onClick={copy}
          className="px-3 py-2.5 bg-bg border-[1.5px] border-border rounded-lg text-xs font-bold whitespace-nowrap"
        >{copied ? '✓' : '🔗'}</button>
      </div>
      <div className="text-[10px] text-muted mt-2">
        ※ 受け取った人はログイン不要で結果を見られます。気に入ったら自分も解析してみよう👇
      </div>
    </div>
  );
}

function DangerZone({ swing, onDeleted }: { swing: SwingDoc; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm('この解析と動画を完全に削除します。よろしいですか？')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/swing/${swing.swingId}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `${r.status}`);
      }
      toast('削除しました');
      onDeleted();
    } catch (e) {
      toast(`削除失敗: ${(e as Error).message}`, 'error');
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 text-center">
      <button
        onClick={del}
        disabled={busy}
        className="text-[11px] text-muted underline disabled:opacity-50"
      >{busy ? '削除中...' : '🗑 この解析と動画を削除'}</button>
    </div>
  );
}
