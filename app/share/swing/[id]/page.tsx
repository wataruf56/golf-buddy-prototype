'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ReviewChunks } from '@/components/swing/ReviewChunks';

const MODE_LABEL: Record<string, string> = {
  self: '🏌️ 自分のスイング解析',
  compare: '🆚 プロ比較',
  past: '📈 過去比較',
  question: '❓ 質問モード',
};

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';

function gcsToPublicUrl(gcsUri?: string): string {
  if (!gcsUri || !gcsUri.startsWith('gs://')) return '';
  const stripped = gcsUri.replace(/^gs:\/\//, '');
  const idx = stripped.indexOf('/');
  if (idx < 0) return '';
  const bucket = stripped.slice(0, idx);
  const objectName = stripped.slice(idx + 1);
  return `https://storage.googleapis.com/${bucket}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
}

type PublicSwing = {
  swingId: string;
  mode: string;
  videoGcsPath: string;
  proGcsPath: string;
  prevGcsPath: string;
  reviewTextChunks: string[];
  createdAt: number;
  completedAt?: number;
  userMessage: string;
};

export default function SharedSwingPage() {
  const params = useParams<{ id: string }>();
  const [swing, setSwing] = useState<PublicSwing | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/swing/${params.id}/public`, { cache: 'no-store' });
        if (!r.ok) {
          if (r.status === 404) throw new Error('この解析結果は見つかりません（削除されたか解析中の可能性があります）');
          throw new Error(`${r.status}`);
        }
        const d = await r.json();
        setSwing(d.swing);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [params.id]);

  if (err) {
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto">
        <Header />
        <div className="bg-card rounded-card p-8 mt-6 text-center shadow-card">
          <div className="text-3xl mb-3">😢</div>
          <div className="text-sm text-red-600 break-words">{err}</div>
        </div>
        <CallToAction />
      </div>
    );
  }
  if (!swing) {
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto">
        <Header />
        <div className="text-center text-muted text-sm mt-10">読み込み中...</div>
      </div>
    );
  }

  const mainVideo = gcsToPublicUrl(swing.videoGcsPath);
  const proVideo = gcsToPublicUrl(swing.proGcsPath);
  const prevVideo = gcsToPublicUrl(swing.prevGcsPath);

  return (
    <div className="min-h-screen bg-bg pb-10 max-w-md mx-auto">
      <Header />

      <div className="px-5 mt-3">
        <div className="bg-card rounded-card p-4 shadow-card mb-3">
          <div className="text-base font-black mb-1">{MODE_LABEL[swing.mode] || swing.mode}</div>
          <div className="text-[11px] text-muted">
            {new Date(swing.createdAt).toLocaleString('ja-JP')} の解析結果
          </div>
          {swing.userMessage && (
            <div className="mt-3 p-3 bg-bg rounded-lg text-[12px] text-sub whitespace-pre-wrap">
              💬 {swing.userMessage}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 mb-4">
          {proVideo && <Video src={proVideo} label="🎥 プロのお手本" />}
          {prevVideo && <Video src={prevVideo} label="🎥 過去のスイング" />}
          {mainVideo && (
            <Video
              src={mainVideo}
              label={
                swing.mode === 'compare' ? '🎥 自分のスイング'
                : swing.mode === 'past' ? '🎥 今回のスイング'
                : '🎥 スイング動画'
              }
            />
          )}
        </div>

        {swing.reviewTextChunks?.length > 0 && (
          <ReviewChunks chunks={swing.reviewTextChunks} />
        )}
      </div>

      <CallToAction />
    </div>
  );
}

function Header() {
  return (
    <div className="bg-gradient-to-r from-green to-emerald-500 text-white px-5 py-4 text-center">
      <div className="text-[11px] font-bold tracking-wider opacity-90">GOLTOMO</div>
      <div className="text-lg font-black leading-tight">⛳ AIスイング解析</div>
      <div className="text-[10px] mt-1 opacity-90">PGAツアープロを指導するレベルのAIコーチが解析</div>
    </div>
  );
}

function Video({ src, label }: { src: string; label: string }) {
  return (
    <div className="bg-card rounded-card p-3 shadow-card">
      <div className="text-[11px] font-bold text-sub mb-2">{label}</div>
      <video src={src} controls playsInline preload="metadata" className="w-full rounded-lg bg-black" />
    </div>
  );
}

function CallToAction() {
  const liffUrl = `https://liff.line.me/${LIFF_ID}?to=${encodeURIComponent('/swing')}`;
  return (
    <div className="px-5 mt-6">
      <div className="bg-gradient-to-br from-green-light to-bg rounded-2xl p-5 text-center border-2 border-green">
        <div className="text-2xl mb-2">🏌️</div>
        <div className="text-base font-black mb-2">あなたのスイングも見てもらいませんか？</div>
        <div className="text-[12px] text-sub leading-relaxed mb-4">
          動画をアップロードするだけで、<br />
          AIコーチがあなたのスイングを<br />
          7フェーズに分けて分析してくれます。
        </div>
        <a
          href={liffUrl}
          className="block w-full py-3 bg-green text-white rounded-xl text-sm font-bold"
        >
          LINEでゴルトモを開く
        </a>
        <div className="text-[10px] text-muted mt-2">※ ベータ版のため、利用には事前承認が必要です</div>
      </div>
    </div>
  );
}
