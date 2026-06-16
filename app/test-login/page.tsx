'use client';

import { useState } from 'react';

// テストログイン画面（app.goltomo.com/test-login）。
// LINEログイン無しでテスト用アカウントにログインできる。テスト用途のため
// パスワードは不要。2人必要な検証（チャットのメンション・マッチング等）は、
// 別のブラウザ（または通常＋シークレットウィンドウ）でそれぞれ別アカウントに
// ログインする。

type Acct = { userId: string; displayName: string; emoji: string; gender?: 'male' | 'female'; car?: 'have' | 'none'; note: string };

const ACCOUNTS: Acct[] = [
  { userId: 'test_taro', displayName: 'テスト太郎', emoji: '🧑', gender: 'male', car: 'have', note: '男性・車あり（送迎テスト向き）' },
  { userId: 'test_hanako', displayName: 'テスト花子', emoji: '👩', gender: 'female', car: 'none', note: '女性・車なし' },
  { userId: 'test_jiro', displayName: 'テスト次郎', emoji: '🧔', gender: 'male', car: 'none', note: '男性・車なし' },
  { userId: 'test_saki', displayName: 'テスト咲', emoji: '👧', gender: 'female', car: 'have', note: '女性・車あり' },
];

export default function TestLoginPage() {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function login(a: Acct) {
    setBusy(a.userId); setErr('');
    try {
      const res = await fetch('/api/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: a.userId, displayName: a.displayName, gender: a.gender, car: a.car }),
        cache: 'no-store',
        credentials: 'include',
      });
      const d = await res.json();
      if (!res.ok) { setErr(d?.error || `エラー (${res.status})`); setBusy(''); return; }
      window.location.href = '/home';
    } catch (e) {
      setErr((e as Error).message); setBusy('');
    }
  }

  return (
    <div className="min-h-screen bg-bg p-5 max-w-md mx-auto">
      <div className="text-2xl font-black mb-1">🧪 テストログイン</div>
      <div className="text-[12px] text-sub mb-5 leading-relaxed">
        LINEログイン無しでテスト用アカウントに入れます。<br />
        <b>2人必要な検証</b>（チャットのメンション・マッチング等）は、別ブラウザ／シークレットウィンドウでそれぞれ別アカウントにログインしてください。
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{err}</div>}

      <div className="flex flex-col gap-2">
        {ACCOUNTS.map((a) => (
          <button
            key={a.userId}
            onClick={() => login(a)}
            disabled={!!busy}
            className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-card text-left disabled:opacity-50"
          >
            <span className="text-2xl">{a.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{a.displayName} <span className="text-[10px] text-muted font-mono">{a.userId}</span></div>
              <div className="text-[11px] text-sub">{a.note}</div>
            </div>
            <span className="text-[12px] font-bold text-green flex-shrink-0">{busy === a.userId ? 'ログイン中…' : 'ログイン →'}</span>
          </button>
        ))}
      </div>

      <div className="text-[10px] text-muted mt-6 leading-relaxed">
        ※ なりすませるのは test_ で始まるテスト専用アカウントのみ（実ユーザーには入れません）。<br />
        ※ ログアウトはマイページ →「その他の設定」→ ログアウト。アカウント切替もそこから。
      </div>
    </div>
  );
}
