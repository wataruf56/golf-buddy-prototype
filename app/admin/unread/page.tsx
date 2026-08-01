'use client';

import { Suspense, useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type UnreadUser = { userId: string; name: string; unread: number; chats: number; lastAt: number };

// ごく簡易な Markdown レンダラ（#, ##, ---, - リスト, **太字**, `code`, _斜体_）。
function renderInline(text: string, keyBase: string) {
  const nodes: React.ReactNode[] = [];
  // **bold** / `code` / _italic_ を順に処理。
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith('**')) nodes.push(<b key={`${keyBase}-b${i++}`}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith('`')) nodes.push(<code key={`${keyBase}-c${i++}`} className="bg-bg px-1 rounded text-[11px] break-all">{tok.slice(1, -1)}</code>);
    else nodes.push(<span key={`${keyBase}-i${i++}`} className="text-muted">{tok.slice(1, -1)}</span>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyBase}-t${i++}`}>{text.slice(last)}</Fragment>);
  return nodes;
}

function Markdown({ md }: { md: string }) {
  const lines = md.split('\n');
  return (
    <div className="text-[13px] leading-relaxed">
      {lines.map((ln, idx) => {
        if (ln.trim() === '') return <div key={idx} className="h-2" />;
        if (ln.startsWith('# ')) return <div key={idx} className="text-lg font-black mt-1 mb-1">{renderInline(ln.slice(2), `l${idx}`)}</div>;
        if (ln.startsWith('## ')) return <div key={idx} className="text-[14px] font-black mt-3 mb-1 text-green">{renderInline(ln.slice(3), `l${idx}`)}</div>;
        if (ln.startsWith('### ')) return <div key={idx} className="text-[13px] font-black mt-2">{renderInline(ln.slice(4), `l${idx}`)}</div>;
        if (ln.trim() === '---') return <hr key={idx} className="my-2 border-border" />;
        if (ln.startsWith('- ')) return <div key={idx} className="flex gap-1.5 pl-1 my-0.5"><span className="text-muted">•</span><span className="flex-1 min-w-0 break-words">{renderInline(ln.slice(2), `l${idx}`)}</span></div>;
        return <div key={idx} className="my-0.5 break-words">{renderInline(ln, `l${idx}`)}</div>;
      })}
    </div>
  );
}

export default function AdminUnreadPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [users, setUsers] = useState<UnreadUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('');
  const [md, setMd] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function loadList(t = token) {
    if (!t) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/unread?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setUsers(j.users || []);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { if (token) loadList(token); /* eslint-disable-next-line */ }, [token]);

  async function openUser(userId: string) {
    setActive(userId); setMd(''); setDetailLoading(true); setCopied(false);
    try {
      const r = await fetch(`/api/admin/unread?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setMd(j.markdown || '（未読はありません）');
    } catch { setMd('取得に失敗しました'); }
    finally { setDetailLoading(false); }
  }

  async function copyMd() {
    try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      {!active ? (
        <>
          <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
          <div className="text-2xl font-black mb-1 mt-1">📩 未読ユーザー</div>
          <div className="text-[12px] text-muted mb-3">DMに未読があるユーザー。タップすると「何が未読か」をMarkdownで確認できます。</div>
          <button onClick={() => loadList()} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold mb-3">🔄 更新</button>
          {loading ? (
            <div className="text-center text-sm text-muted py-10">読み込み中...</div>
          ) : users.length === 0 ? (
            <div className="text-center text-sm text-muted py-10">未読のあるユーザーはいません 🎉</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {users.map((u) => (
                <button key={u.userId} onClick={() => openUser(u.userId)} className="flex items-center gap-3 p-3 bg-card rounded-xl shadow-card text-left">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{u.name}</div>
                    <div className="text-[11px] text-muted">最終 {u.lastAt ? new Date(u.lastAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} ・ {u.chats}件のチャット</div>
                  </div>
                  <span className="px-2 py-1 bg-orange text-white text-[12px] font-black rounded-full flex-shrink-0">未読 {u.unread}</span>
                  <span className="text-muted">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { setActive(''); setMd(''); }} className="text-blue text-sm font-semibold">‹ 一覧</button>
            <div className="flex-1" />
            <button onClick={copyMd} disabled={!md} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold disabled:opacity-50">{copied ? '✓ コピー' : '📋 Markdownをコピー'}</button>
            <Link href={`/admin/support?token=${token}&userId=${active}`} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-black">🛡️ 連絡</Link>
          </div>
          {detailLoading ? (
            <div className="text-center text-sm text-muted py-10">読み込み中...</div>
          ) : (
            <div className="bg-card rounded-xl shadow-card p-4">
              <Markdown md={md} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
