'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModeSelector } from '@/components/swing/ModeSelector';
import { VideoUploader } from '@/components/swing/VideoUploader';
import { toast } from '@/components/Toast';
import { getMe, useStore } from '@/lib/store';
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
  const me = useStore(getMe);
  const hydrated = useStore((s) => s.hydrated);

  // Profile completeness — must have these 4 before AI analysis.
  // We use them as user context when invoking the analyzer.
  const profileMissing: string[] = [];
  if (!me.gender) profileMissing.push('性別');
  if (!me.age || me.age <= 0) profileMissing.push('年齢');
  if (!me.scoreRange) profileMissing.push('平均スコア');
  if (!me.golfHistory) profileMissing.push('ゴルフ歴');
  const profileReady = hydrated && profileMissing.length === 0;

  const [mode, setMode] = useState<SwingMode | ''>('');
  const [videoUri, setVideoUri] = useState('');
  const [proUri, setProUri] = useState('');
  const [prevUri, setPrevUri] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const missing: string[] = [];
  if (!mode) missing.push('分析モード');
  if (mode === 'compare' && !proUri) missing.push('プロ動画');
  if (mode === 'past' && !prevUri) missing.push('過去動画');
  if (mode && !videoUri) missing.push('自分の動画');
  if (mode === 'question' && !userMessage.trim()) missing.push('質問内容');
  const ready = missing.length === 0;

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

  if (hydrated && !profileReady) {
    return (
      <div className="px-5 py-3">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
        <div className="text-2xl font-black mb-4">新規スイング分析</div>

        <div className="bg-card rounded-card p-5 shadow-card text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-sm font-black mb-2">プロフィール情報が必要です</div>
          <div className="text-[12px] text-sub leading-relaxed mb-4">
            AIコーチがあなたに合わせた解析をするために、<br />
            下記の情報を登録してください。
          </div>
          <div className="bg-bg rounded-lg p-3 mb-4 text-left">
            <div className="text-[11px] text-muted mb-1.5">未入力の項目</div>
            <ul className="text-[13px] font-bold text-orange space-y-1">
              {profileMissing.map((m) => <li key={m}>・{m}</li>)}
            </ul>
          </div>
          <Link
            href="/mypage/edit"
            className="inline-block w-full py-3 bg-green text-white rounded-xl text-sm font-bold"
          >
            プロフィールを編集する
          </Link>
          <div className="text-[10px] text-muted mt-2">登録は1分で完了します</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>
      <div className="text-2xl font-black mb-4">新規スイング分析</div>

      <details className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <summary className="text-xs font-bold text-blue cursor-pointer">📹 動画の撮り方のコツ（タップで開く）</summary>
        <ul className="text-[12px] text-text leading-relaxed mt-2 space-y-1.5">
          <li>📐 <b>横から撮る</b>（飛球線方向の真横、ターゲットラインに垂直）</li>
          <li>👤 <b>全身が画面に入る</b>ようにスマホを縦向きで（足元〜頭上＋少し余白）</li>
          <li>🌳 <b>シンプルな背景</b>を選ぶ（人や旗が背後にあると認識精度↓）</li>
          <li>⏱ <b>3〜10秒</b>の長さがベスト（テークバック前〜フィニッシュ後まで）</li>
          <li>📱 <b>三脚やスマホスタンド</b>推奨（手ブレ厳禁）</li>
          <li>☀️ <b>明るい場所</b>で撮影（暗いと骨格認識が落ちる）</li>
        </ul>
      </details>

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
          {!ready && missing.length > 0 && (
            <div className="text-[11px] text-orange text-center mt-2 font-bold">
              未入力: {missing.join(' / ')}
            </div>
          )}
          <div className="text-[10px] text-muted text-center mt-2">解析には1〜2分ほどかかります</div>
        </>
      )}
      <div className="h-5" />
    </div>
  );
}
