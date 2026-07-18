'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';

// QRコードで友達になるページ。
//  - 「マイQRコード」：自分のQR（friend追加URL）を表示 → 相手に読み取ってもらう
//  - 「読み取る」：LINE標準スキャナ(liff.scanCodeV2)で相手のQRを読む
const APP_BASE = 'https://app.goltomo.com';
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';

export default function QrPage() {
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const hydrated = useStore((s) => s.hydrated);
  const [mode, setMode] = useState<'mine' | 'scan'>('mine');
  const [scanning, setScanning] = useState(false);

  const addUrl = meId ? `${APP_BASE}/add-friend?u=${encodeURIComponent(meId)}` : '';

  function extractUserId(scanned: string): string | null {
    if (!scanned) return null;
    try {
      const u = new URL(scanned);
      const q = u.searchParams.get('u');
      if (q) return q;
    } catch { /* URLでない場合は下へ */ }
    if (/^[A-Za-z0-9_-]{3,}$/.test(scanned)) return scanned; // 生のIDが入っていた場合
    return null;
  }

  async function scan() {
    if (!meId) { router.push(`/liff?to=${encodeURIComponent('/qr')}`); return; }
    setScanning(true);
    try {
      const liff = (await import('@line/liff')).default;
      try { await liff.init({ liffId: LIFF_ID }); } catch { /* 既に初期化済みなら無視 */ }
      if (!liff.isInClient || !liff.isInClient()) {
        toast('読み取りはLINEアプリ内で使えます。LINE外では、相手のスマホカメラで「マイQRコード」を読んでもらってください。', 'error');
        setMode('mine');
        return;
      }
      const res: any = await (liff as any).scanCodeV2();
      const value: string = res?.value || '';
      const uid = extractUserId(value);
      if (!uid) { toast('ゴルトモのQRコードではないようです', 'error'); return; }
      track('qr_scan_ok', {});
      router.push(`/add-friend?u=${encodeURIComponent(uid)}`);
    } catch {
      toast('読み取りをキャンセルしました');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/mypage')} className="text-sm text-blue font-semibold">← マイページ</button>
      </div>
      <div className="text-2xl font-black tracking-tight mb-1">QRコードで友達</div>
      <div className="text-[13px] text-sub mb-4">直接会った人と、QRコードで友達になれます。友達になるとメッセージができます。</div>

      {/* モード切替 */}
      <div className="flex gap-1 mb-5 bg-bg rounded-xl p-1">
        {([['mine', 'マイQRコード'], ['scan', '読み取る']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={'flex-1 py-2.5 rounded-lg text-[13px] font-black ' + (mode === k ? 'bg-orange text-white shadow-sm' : 'text-sub')}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'mine' ? (
        <div className="bg-card rounded-card p-6 shadow-card text-center">
          {me && (
            <div className="flex flex-col items-center gap-1 mb-4">
              <Avatar user={me} size={56} />
              <div className="text-base font-black">{me.displayName}</div>
            </div>
          )}
          {addUrl ? (
            <div className="inline-block bg-white p-4 rounded-2xl border-[1.5px] border-border">
              <QRCodeSVG value={addUrl} size={196} level="M" includeMargin={false} />
            </div>
          ) : hydrated ? (
            <div className="py-10 text-sub text-sm">
              ログインするとQRコードが表示されます。
              <a href={`/liff?to=${encodeURIComponent('/qr')}`} className="block mt-3 mx-auto max-w-[200px] py-2.5 bg-green text-white rounded-xl text-sm font-black">ログインする →</a>
            </div>
          ) : (
            <div className="py-10 text-muted text-sm">読み込み中...</div>
          )}
          <div className="text-[12px] text-sub mt-4 leading-relaxed">
            相手にこのQRコードを読み取ってもらうと、<b className="text-text">お互いに友達</b>になります。
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-card p-6 shadow-card text-center">
          <div className="text-5xl mb-3">📷</div>
          <div className="text-sm font-bold text-text mb-1">相手のQRコードを読み取る</div>
          <div className="text-[12px] text-sub mb-5 leading-relaxed">
            カメラが開いたら、相手の「マイQRコード」を枠に合わせてください。
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-black disabled:opacity-50"
          >
            {scanning ? 'カメラ起動中…' : 'カメラで読み取る'}
          </button>
          <div className="text-[11px] text-muted mt-3 leading-relaxed">
            ※ 読み取りはLINEアプリ内で使えます。LINEの外では、相手のスマホカメラで「マイQRコード」を読んでもらってください。
          </div>
        </div>
      )}
    </div>
  );
}
