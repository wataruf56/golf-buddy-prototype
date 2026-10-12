'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminTabs } from '@/components/AdminTabs';
import { useSearchParams } from 'next/navigation';
import { Linkify } from '@/components/Linkify';

type UnreadUser = { userId: string; name: string; unread: number; chats: number; lastAt: number };
type UnreadConfig = { enabled: boolean; delayMinutes: number; messageText: string; updatedAt?: number };

// 未読の内訳（チャットごと・未読メッセージの本文つき）（2026-10-12）
type UnreadMsg = { senderId: string; senderName: string; text: string; hasImage: boolean; createdAt: number };
type UnreadChat = { chatId: string; feature: string; fromId: string; fromName: string; unread: number; lastAt: number; messages?: UnreadMsg[] };
type UnreadDetail = { user: { userId: string; name: string }; total: number; detail: UnreadChat[]; markdown: string };

// 日本時間で「10/12 11:47」
function jst(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const [detail, setDetail] = useState<UnreadDetail | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // 未読通知の設定（送信タイミング＝経過時間・ON/OFF・通知文）。
  const [cfg, setCfg] = useState<UnreadConfig | null>(null);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState('');
  const [running, setRunning] = useState(false);

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

  async function loadConfig(t = token) {
    if (!t) return;
    try {
      const r = await fetch(`/api/admin/unread-config?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && j.config) setCfg(j.config);
    } catch { /* ignore */ }
  }
  useEffect(() => { if (token) loadConfig(token); /* eslint-disable-next-line */ }, [token]);

  async function saveConfig() {
    if (!cfg) return;
    setCfgSaving(true); setCfgMsg('');
    try {
      const r = await fetch(`/api/admin/unread-config?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: cfg.enabled, delayMinutes: cfg.delayMinutes, messageText: cfg.messageText }),
      });
      const j = await r.json();
      if (r.ok && j.config) { setCfg(j.config); setCfgMsg('✓ 保存しました'); }
      else setCfgMsg('保存に失敗しました');
    } catch { setCfgMsg('保存に失敗しました'); }
    finally { setCfgSaving(false); setTimeout(() => setCfgMsg(''), 2500); }
  }

  async function runNow() {
    setRunning(true); setCfgMsg('');
    try {
      const r = await fetch(`/api/admin/unread-config?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      const j = await r.json();
      if (r.ok) { setCfgMsg(`📨 ${j.result?.sent ?? 0}件送信しました`); loadList(); }
      else setCfgMsg('送信に失敗しました');
    } catch { setCfgMsg('送信に失敗しました'); }
    finally { setRunning(false); setTimeout(() => setCfgMsg(''), 3500); }
  }

  async function openUser(userId: string) {
    setActive(userId); setMd(''); setDetail(null); setDetailErr(''); setDetailLoading(true); setCopied(false);
    try {
      const r = await fetch(`/api/admin/unread?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setDetail(j); setMd(j.markdown || ''); }
      else setDetailErr('取得に失敗しました');
    } catch { setDetailErr('取得に失敗しました'); }
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
          <AdminTabs token={token} group="messages" current="/admin/unread" />
          <div className="text-2xl font-black mb-1 mt-1">📩 未読ユーザー</div>
          <div className="text-[12px] text-muted mb-3">DMに未読があるユーザー。タップすると未読のメッセージ（本文）を確認できます。</div>

          {/* ⚙️ 未読通知の設定（送信タイミング＝経過時間・ON/OFF・通知文・今すぐ送信） */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-4">
            <div className="text-sm font-black mb-1">⚙️ 未読通知の設定</div>
            <div className="text-[11px] text-muted mb-3 leading-relaxed">
              メッセージが来て<b className="text-text">一定時間以上</b>未読の人へ、LINEで1通だけ通知します。
              一度通知した未読は再通知しません（追いメッセージ／別の人からの新規が来たときだけ再通知）。
            </div>
            {!cfg ? (
              <div className="text-xs text-muted py-2">設定を読み込み中...</div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between">
                  <span className="text-[13px] font-bold">通知を有効にする</span>
                  <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} className="w-5 h-5" />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold flex-1">送信までの経過時間</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      value={String(cfg.delayMinutes)}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        // 数字だけ拾い、先頭ゼロを除去（"015" → "15"）。0〜1440 に丸める。
                        const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                        const n = Math.max(0, Math.min(1440, parseInt(digits || '0', 10) || 0));
                        setCfg({ ...cfg, delayMinutes: n });
                      }}
                      className="w-20 px-2 py-1.5 bg-bg border border-border rounded-lg text-sm text-right"
                    />
                    <span className="text-[12px] text-muted">分</span>
                  </span>
                </label>
                <div className="text-[10px] text-muted -mt-1">例: 15分 = メッセージ受信から15分以上未読なら次の巡回(15分毎)で送信。0分＝ほぼ即時。</div>
                <div>
                  <div className="text-[13px] font-bold mb-1">通知の文面</div>
                  <textarea
                    value={cfg.messageText} maxLength={200} rows={2}
                    onChange={(e) => setCfg({ ...cfg, messageText: e.target.value })}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveConfig} disabled={cfgSaving} className="px-4 py-2 bg-green text-white rounded-lg text-sm font-bold disabled:opacity-50">
                    {cfgSaving ? '保存中...' : '保存'}
                  </button>
                  <button onClick={runNow} disabled={running} className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold disabled:opacity-50">
                    {running ? '送信中...' : '📨 今すぐ送信'}
                  </button>
                  {cfgMsg && <span className="text-[12px] text-green font-bold">{cfgMsg}</span>}
                </div>
              </div>
            )}
          </div>

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
            <button onClick={() => { setActive(''); setMd(''); setDetail(null); }} className="text-blue text-sm font-semibold">‹ 一覧</button>
            <div className="flex-1" />
            <button onClick={copyMd} disabled={!md} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold disabled:opacity-50">{copied ? '✓ コピー' : '📋 コピー'}</button>
            <Link href={`/admin/support?token=${token}&userId=${active}`} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-black">🛡️ 連絡</Link>
          </div>
          {detailLoading ? (
            <div className="text-center text-sm text-muted py-10">読み込み中...</div>
          ) : detailErr || !detail ? (
            <div className="text-center text-sm text-muted py-10">{detailErr || '取得に失敗しました'}</div>
          ) : (
            <>
              <div className="text-lg font-black">📩 {detail.user.name} さんの未読</div>
              <div className="text-[12px] text-muted mb-1">未読 <b className="text-text">{detail.total}件</b>（{detail.detail.length}件のやり取り）</div>
              <div className="text-[11px] text-red mb-3">個人間のやり取りです。取り扱いに注意。</div>
              {detail.detail.length === 0 ? (
                <div className="text-center text-sm text-muted py-10">未読はありません</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {detail.detail.map((c) => {
                    const msgs = c.messages || [];
                    return (
                      <div key={c.chatId} className="bg-card rounded-xl shadow-card p-3.5">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-muted">{c.feature === 'DM' ? '💬 DM' : '🛡️ 管理人チャット'}</div>
                            <div className="text-[14px] font-black break-words">{c.fromName} さんから</div>
                          </div>
                          <span className="px-2 py-0.5 bg-orange text-white text-[11px] font-black rounded-full flex-shrink-0">未読 {c.unread}</span>
                        </div>
                        {msgs.length === 0 ? (
                          <div className="text-[12px] text-muted py-2">メッセージを読み込めませんでした。</div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {msgs.map((m, i) => (
                              <div key={i} className="p-2.5 bg-bg rounded-lg">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-[12px] font-bold text-text truncate">{m.senderName}</span>
                                  <span className="text-[10px] text-muted flex-shrink-0">{jst(m.createdAt)}</span>
                                </div>
                                {m.text && <div className="text-[13px] whitespace-pre-wrap break-words"><Linkify text={m.text} /></div>}
                                {m.hasImage && <div className="text-[12px] text-sub mt-0.5">📷 画像</div>}
                                {!m.text && !m.hasImage && <div className="text-[12px] text-muted">（本文なし）</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        {msgs.length > 0 && msgs.length < c.unread && (
                          <div className="text-[10px] text-muted mt-1">※ 新しい{msgs.length}件だけ表示しています</div>
                        )}
                        {/* 前後のやり取りはDMログで（2026-10-12） */}
                        <Link href={`/admin/dm?token=${encodeURIComponent(token)}&chatId=${encodeURIComponent(c.chatId)}`} className="block text-right text-[12px] text-blue font-bold mt-2">
                          やり取りをすべて見る（DMログ）›
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
