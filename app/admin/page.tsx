'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function AdminTop() {
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
  const [stats, setStats] = useState<{ users: number; swingAllowed: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Always treat /api/admin/init as the source of truth for the token. A
    // cached localStorage token can go stale when ADMIN_LOG_TOKEN rotates on
    // redeploy — that previously made every /api/admin/* call 403 and the
    // screens came up blank. By fetching the live token here and overwriting
    // the cache, a rotation self-heals as soon as the admin opens /admin.
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached); // optimistic: render immediately
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const t: string = j?.token || '';
        if (t && t !== cached) {
          localStorage.setItem('gb_admin_token', t);
          setToken(t);
        } else if (t) {
          localStorage.setItem('gb_admin_token', t);
        }
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        setStats({ users: d.count, swingAllowed: d.allowedCount });
      } catch {}
    })();
  }, [token]);

  if (!token) {
    // Brief loading state while /api/admin/_init responds; no manual prompt.
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center">
        <div className="text-sm text-muted">⚙️ 管理画面を読み込み中...</div>
      </div>
    );
  }

  const items = [
    { href: `/admin/activity?token=${token}`, emoji: '📈', title: '利用状況レポート', desc: 'アクティブユーザー / 操作ログ / スイング解析の利用状況' },
    { href: `/admin/lp?token=${token}`, emoji: '📊', title: 'LP診断レポート', desc: '来訪 / 診断ファネル / 結果タイプ / 興味シグナル需要プール' },
    { href: `/admin/users?token=${token}`, emoji: '👥', title: 'ユーザー管理', desc: 'LINE登録ユーザー一覧 / Swing許可リスト編集' },
    { href: `/admin/rounds?token=${token}`, emoji: '🏆', title: 'ラウンド募集', desc: '全募集の一覧・削除' },
    { href: `/admin/titles?token=${token}`, emoji: '✍️', title: 'タイトル定型文', desc: 'ラウンド募集タイトルのプルダウン選択肢を自由に編集' },
    { href: `/admin/reminders?token=${token}`, emoji: '⏰', title: '開催前リマインド設定', desc: '参加ラウンドの何日前に全体通知するか（1ヶ月前/1週間前/前日など）' },
    { href: `/admin/rematch?token=${token}`, emoji: '🔁', title: '再会エンジン', desc: '再会通知のタイミング設定・今すぐ実行（テスト）・5段ファネル' },
    { href: `/admin/reviews?token=${token}`, emoji: '📝', title: 'レビュー', desc: '編集・削除・差し戻し（再依頼）' },
    { href: `/admin/swing?token=${token}`, emoji: '🏌️', title: 'スイング解析モニタ', desc: '解析履歴・状態確認・スタック復旧' },
    { href: `/admin/system?token=${token}`, emoji: '🔧', title: 'システム状態', desc: '環境変数 / GCS / LINE Bot 接続確認' },
  ];

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="text-2xl font-black mb-1">⚙️ 管理画面</div>
      {stats && (
        <div className="text-[11px] text-muted mb-4">
          総ユーザー <b className="text-text">{stats.users}</b> / Swing許可 <b className="text-text">{stats.swingAllowed}</b>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-card"
          >
            <span className="text-2xl">{it.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-[11px] text-sub mt-0.5 truncate">{it.desc}</div>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </div>

      <button
        onClick={() => { localStorage.removeItem('gb_admin_token'); setToken(''); }}
        className="w-full mt-6 p-3 text-xs text-muted underline"
      >トークンを忘れる (ログアウト)</button>
    </div>
  );
}
