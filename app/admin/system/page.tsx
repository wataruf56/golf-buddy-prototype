'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function AdminSystemPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [swing, setSwing] = useState<any>(null);
  const [push, setPush] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    setToken(t);
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/swing-test?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (r.ok) setSwing(await r.json());
      } catch {}
      try {
        const r = await fetch(`/api/admin/push-test?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (r.ok) setPush(await r.json());
      } catch {}
    })();
  }, [token]);

  const Row = ({ label, value, ok }: { label: string; value?: any; ok?: boolean }) => (
    <div className="flex justify-between items-center py-1.5 text-xs border-b border-border last:border-0">
      <span className="text-sub">{label}</span>
      <span className={`font-mono text-right ${ok === false ? 'text-red-600' : ok === true ? 'text-green' : 'text-text'}`}>
        {value ?? '-'}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">🔧 システム</div>
        <div className="w-8" />
      </div>

      <div className="bg-card rounded-xl p-4 mb-3 shadow-card">
        <div className="text-xs font-bold mb-2">🏌️ Swing 解析</div>
        {swing ? (
          <>
            <Row label="Cloud Run URL" ok={swing.env?.SWING_ANALYZER_URL} value={swing.env?.SWING_ANALYZER_URL ? 'OK' : '未設定'} />
            <Row label="Shared Secret" ok={swing.env?.SWING_ANALYZER_SHARED_SECRET} value={swing.env?.SWING_ANALYZER_SHARED_SECRET ? 'OK' : '未設定'} />
            <Row label="GCS バケット" value={swing.env?.GCS_BUCKET} />
            <Row label="GCS 鍵" ok={swing.env?.GCS_SA_KEY_JSON_present} value={swing.env?.GCS_SA_KEY_JSON_present ? `OK (${swing.env?.GCS_SA_KEY_JSON_length}b)` : '未設定'} />
            <Row label="Signed URL" ok={swing.signedUrlOk} value={swing.signedUrlOk ? 'OK' : 'ERROR'} />
            <Row label="Cron Secret" ok={swing.env?.CRON_SECRET} value={swing.env?.CRON_SECRET ? 'OK' : '未設定'} />
          </>
        ) : <div className="text-xs text-muted">読み込み中...</div>}
      </div>

      <div className="bg-card rounded-xl p-4 mb-3 shadow-card">
        <div className="text-xs font-bold mb-2">💬 LINE Bot (Push通知)</div>
        {push ? (
          <>
            <Row label="Channel Access Token" ok={push.env?.hasAccessToken} value={push.env?.hasAccessToken ? `OK (${push.env?.accessTokenLength}文字)` : '未設定'} />
            <Row label="Channel Secret" ok={push.env?.hasChannelSecret} value={push.env?.hasChannelSecret ? 'OK' : '未設定'} />
            <Row label="Bot Basic ID" value={push.env?.botBasicId} />
            <Row label="Bot 接続" ok={push.botInfoStatus === 200} value={push.botInfo?.displayName || `Status ${push.botInfoStatus}`} />
          </>
        ) : <div className="text-xs text-muted">読み込み中...</div>}
      </div>

      <div className="bg-card rounded-xl p-4 mb-3 shadow-card">
        <div className="text-xs font-bold mb-2">🚀 デプロイ</div>
        <Row label="本番URL (LIFF)" value="app.goltomo.com" />
        <Row label="本番URL (LP)" value="goltomo.com" />
        <Row label="管理画面" value="admin.goltomo.com" />
        <Row label="(旧)" value="golf-buddy-prototype.vercel.app" />
        <Row label="LIFF URL" value="liff.line.me/2009973733-P5UdNex9" />
      </div>

      <div className="text-[10px] text-muted text-center px-3">
        ※ 設定変更が必要な場合は Vercel ダッシュボード → Settings → Environment Variables から
      </div>
    </div>
  );
}
