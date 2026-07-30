'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { APP_VERSION } from '@/lib/appUpdate';

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
  // 「気になる系」通知を全員OFFにする移行（1回限り）。
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  async function migrateInterestOff() {
    if (migrating) return;
    if (!window.confirm('既存ユーザー全員の「気になる系」LINE通知（気になるが押された／締切間近）を一括OFFにします。1回だけ実行してください。よろしいですか？')) return;
    setMigrating(true); setMigrateMsg('');
    try {
      const r = await fetch(`/api/admin/notif-off-migrate?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMigrateMsg(`✅ 完了（${j.updated} 人を一括OFFにしました）`);
    } catch (e) { setMigrateMsg('失敗: ' + (e as Error).message); }
    setMigrating(false);
  }

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
    { href: `/admin/analytics?token=${token}`, emoji: '📈', title: 'アクセス分析', desc: '登録者数の推移 / 時間帯別アクセス / カレンダー（日付タップで時間帯別）' },
    { href: `/admin/activity?token=${token}`, emoji: '📈', title: '利用状況レポート', desc: 'アクティブユーザー / 操作ログ / スイング解析の利用状況' },
    { href: `/admin/line-stats?token=${token}`, emoji: '📨', title: 'LINE送信レポート', desc: '種別ごとの送信通数・月別推移（LINE有料化の通数把握）' },
    { href: `/admin/lp?token=${token}`, emoji: '📊', title: 'LP診断レポート', desc: '来訪 / 診断ファネル / 結果タイプ / 興味シグナル需要プール' },
    { href: `/admin/users?token=${token}`, emoji: '👥', title: 'ユーザー管理', desc: 'LINE登録ユーザー一覧 / Swing許可リスト編集' },
    { href: `/admin/rounds?token=${token}`, emoji: '🏆', title: 'ラウンド募集', desc: '全募集の一覧・削除' },
    { href: `/admin/titles?token=${token}`, emoji: '✍️', title: 'タイトル定型文', desc: 'ラウンド募集タイトルのプルダウン選択肢を自由に編集' },
    { href: `/admin/reminders?token=${token}`, emoji: '⏰', title: '開催前リマインド設定', desc: '参加ラウンドの何日前に全体通知するか（1ヶ月前/1週間前/前日など）' },
    { href: `/admin/rematch?token=${token}`, emoji: '🔁', title: '再会エンジン', desc: '再会通知のタイミング設定・今すぐ実行（テスト）・5段ファネル' },
    { href: `/admin/test-accounts?token=${token}`, emoji: '🧪', title: 'テストアカウント管理', desc: '検証用アカウントの登録 / 一般ユーザーから隠す / 新機能の段階公開' },
    { href: `/admin/notification-templates?token=${token}`, emoji: '✉️', title: '通知メッセージ編集', desc: 'アプリ内 / LINE / スマホ通知の文面をすべて編集' },
    { href: `/admin/reports?token=${token}`, emoji: '🚨', title: '通報の管理', desc: '通報一覧 / 事実確認して「評価を下げる」/ 通報者とチャット' },
    { href: `/admin/support?token=${token}`, emoji: '🛡️', title: '管理人チャット', desc: 'ユーザーと「管理人」名義でDM（サポート窓口）' },
    { href: `/admin/hobby-tags?token=${token}`, emoji: '🎯', title: '趣味タグの管理', desc: 'ユーザーが追加した趣味タグの確認・不適切タグの削除' },
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

      {/* 通知の一括OFF移行（1回限り・見つけやすいよう管理トップに配置） */}
      <div className="bg-card rounded-xl shadow-card p-4 mt-4">
        <div className="text-[13px] font-black mb-1">🔕 「気になる系」通知を全員OFF（1回限り）</div>
        <div className="text-[11px] text-sub mb-3 leading-relaxed">
          既存ユーザー全員の <b>「💚 気になるが押された」「⏰ 締切間近」</b> のLINE通知を一括OFFにします（初期値OFFへの移行）。ユーザーは自分で再度ONにできます。<b>1回だけ</b>押してください。
        </div>
        <button
          onClick={migrateInterestOff}
          disabled={migrating}
          className="w-full py-3 bg-sub text-white rounded-xl text-sm font-black disabled:opacity-50"
        >{migrating ? '実行中…' : '既存ユーザーを一括OFFにする'}</button>
        {migrateMsg && <div className="text-[12px] text-center mt-2 font-bold">{migrateMsg}</div>}
      </div>

      <button
        onClick={() => { localStorage.removeItem('gb_admin_token'); setToken(''); }}
        className="w-full mt-6 p-3 text-xs text-muted underline"
      >トークンを忘れる (ログアウト)</button>

      <div className="text-center text-[11px] text-muted py-3">管理画面 ver {APP_VERSION}</div>
    </div>
  );
}
