'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModeSelector } from '@/components/swing/ModeSelector';
import { VideoUploader } from '@/components/swing/VideoUploader';
import { toast } from '@/components/Toast';
import type { SwingMode } from '@/types/swing';

function genId(): string {
  // 16-char alphanumeric, sortable enough by createdAt anyway.
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${ts}${rand}`.slice(0, 22);
}

export default function NewSwingPage() {
  const router = useRouter();
  const swingId = useMemo(genId, []);
  const [mode, setMode] = useState<SwingMode | ''>('');
  const [videoUri, setVideoUri] = useState('');
  const [proUri, setProUri] = useState('');
  const [prevUri, setPrevUri] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ready =
    !!mode &&
    !!videoUri &&
    (mode !== 'compare' || !!proUri) &&
    (mode !== 'past' || !!prevUri) &&
    (mode !== 'question' || !!userMessage.trim());

  async function submit() {
    if (!ready || !mode) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/swing/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swingId,
          mode,
          videoGcsPath: videoUri,
          proGcsPath: proUri || undefined,
          prevGcsPath: prevUri || undefined,
          userMessage: userMessage.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`${r.status} ${t.slice(0, 120)}`);
      }
      router.push(`/swing/${swingId}`);
    } catch (e) {
      toast(`送信失敗: ${(e as Error).message}`, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
      <div className="text-2xl font-black mb-4">新規スイング分析</div>

      <div className="text-xs font-bold text-sub mb-2">① 分析モードを選ぶ</div>
      <ModeSelector value={mode} onChange={setMode} />

      {mode && (
        <>
          {mode === 'compare' && (
            <div className="mt-5">
              <div className="text-xs font-bold text-sub mb-2">② プロのお手本動画</div>
              <VideoUploader swingId={swingId} role="pro" label="プロ動画" onUploaded={setProUri} />
            </div>
          )}
          {mode === 'past' && (
            <div className="mt-5">
              <div className="text-xs font-bold text-sub mb-2">② 過去のスイング動画</div>
              <VideoUploader swingId={swingId} role="prev" label="過去動画" onUploaded={setPrevUri} />
            </div>
          )}

          <div className="mt-5">
            <div className="text-xs font-bold text-sub mb-2">
              {mode === 'compare' || mode === 'past' ? '③ 自分の動画（今回）' : '② 自分の動画'}
            </div>
            <VideoUploader swingId={swingId} role="video" label="自分の動画" onUploaded={setVideoUri} />
          </div>

          <div className="mt-5">
            <div className="text-xs font-bold text-sub mb-2">
              {mode === 'question' ? '③ 質問内容（必須）' : '③ 補足メッセージ（任意）'}
            </div>
            <textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value.slice(0, 500))}
              placeholder={mode === 'question'
                ? '例: 飛距離を伸ばすにはどこを直せば良い？'
                : '例: 最近スライスが直らなくて困っています'}
              className="w-full h-24 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
            />
            <div className="text-[10px] text-muted text-right mt-0.5">{userMessage.length}/500</div>
          </div>

          <button
            onClick={submit}
            disabled={!ready || submitting}
            className="w-full py-4 mt-5 bg-green text-white rounded-xl text-[15px] font-bold disabled:opacity-50"
          >
            {submitting ? '送信中...' : 'AI コーチに見てもらう'}
          </button>
          <div className="text-[10px] text-muted text-center mt-2">解析には1〜2分ほどかかります</div>
        </>
      )}
      <div className="h-5" />
    </div>
  );
}
