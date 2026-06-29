'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：ラウンド募集タイトルのプルダウン定型文を自由に編集する。
// 1行 = 1つのタイトル。create / edit 画面のプルダウンに反映される。

export default function AdminTitlesPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    // タイトルの取得はトークン不要（公開GET）。先に表示しておく。
    (async () => {
      try {
        const r = await fetch('/api/round-titles', { cache: 'no-store' });
        const j = await r.json();
        if (r.ok && Array.isArray(j.titles)) setText(j.titles.join('\n'));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  async function save() {
    if (!token) { setMsg('管理者トークンが見つかりません'); return; }
    setSaving(true); setMsg('');
    try {
      const r = await fetch(`/api/round-titles?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: lines }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setText((j.titles || []).join('\n'));
      setMsg('保存しました ✅');
    } catch (e) { setMsg('保存失敗: ' + (e as Error).message); }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">📝 タイトル定型文の編集</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        ラウンド募集の「タイトル」プルダウンに表示される選択肢を編集できます。<br />
        <b>1行＝1つのタイトル</b>。上から表示順になります（最大50件・各60文字まで）。<br />
        ※ ユーザーは引き続き「✏️ 自由入力」で任意のタイトルも入力できます。
      </div>

      {!loaded ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : (
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[12px] font-bold text-sub">タイトル一覧（1行1つ）</div>
            <div className="text-[11px] text-muted">{lines.length}件</div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            placeholder={'初心者歓迎！のんびりラウンド\nワイワイ楽しく18ホール\n…'}
            className="w-full p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-y leading-relaxed"
          />
          <button onClick={save} disabled={saving || !token} className="w-full mt-3 py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {saving ? '保存中…' : 'この内容で保存する'}
          </button>
          {msg && <div className="text-[12px] text-center mt-2 font-bold">{msg}</div>}
          <div className="text-[10px] text-muted mt-4 leading-relaxed">
            ※ 空行は無視されます。重複したタイトルは1つにまとめられます。<br />
            ※ 保存するとすぐに募集投稿・編集画面のプルダウンへ反映されます。
          </div>
        </div>
      )}
    </div>
  );
}
