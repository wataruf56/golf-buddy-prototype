'use client';

import { useEffect, useState } from 'react';
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';
import { Linkify } from '@/components/Linkify';

// 管理画面：ラウンドのグループチャットを閲覧・不適切な発言を削除・「管理人」として発言（2026-10-08 送信を追加）。
// 行ける日の部屋（運営主催）もここから話しかけられる。
export function AdminRoundChat({ token, roundId, defaultOpen = false, label = '💬 ラウンドメッセージを見る' }: { token: string; roundId: string; defaultOpen?: boolean; label?: string }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    if (!(await confirmDialog('管理人としてこのグループチャットに送りますか？（参加者に通知が届きます）'))) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/round-messages?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, text: t }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      setText('');
      await load();
    } catch { alertDialog('送信に失敗しました'); }
    finally { setSending(false); }
  }
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/round-messages?token=${encodeURIComponent(token)}&roundId=${encodeURIComponent(roundId)}`, { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) { setMsgs(d.items || []); setUsers(d.users || {}); }
      else { alertDialog('取得失敗: ' + (d.error || r.status)); }
    } catch { alertDialog('取得失敗'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (defaultOpen && msgs === null) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [defaultOpen]);

  async function del(messageId: string) {
    if (!(await confirmDialog('このメッセージを削除しますか？（元に戻せません）'))) return;
    try {
      const r = await fetch(`/api/admin/round-messages?token=${encodeURIComponent(token)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, messageId }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      setMsgs((prev) => (prev || []).filter((m) => m.id !== messageId));
    } catch { alertDialog('削除に失敗しました'); }
  }

  return (
    <details
      className="mt-2"
      open={defaultOpen || undefined}
      onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && msgs === null) load(); }}
    >
      <summary className="text-[11px] font-bold text-blue cursor-pointer py-1">{label}</summary>
      <div className="mt-1 flex flex-col gap-1.5">
        {loading && <div className="text-[10px] text-muted">読み込み中...</div>}
        {msgs && msgs.length === 0 && <div className="text-[10px] text-muted">メッセージはありません</div>}
        {msgs && msgs.map((m) => {
          const u = users[m.senderId] || { displayName: m.senderId, avatar: '?' };
          return (
            <div key={m.id} className="bg-bg rounded-lg p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold truncate">{u.avatar} {u.displayName}{m.threadId ? ' ・スレッド' : ''}</span>
                <button onClick={() => del(m.id)} className="text-[10px] font-bold text-red-600 px-2 py-0.5 bg-red-50 rounded flex-shrink-0">削除</button>
              </div>
              <div className="text-[12px] mt-0.5 whitespace-pre-wrap break-words"><Linkify text={m.text} /></div>
              <div className="text-[9px] text-muted mt-0.5">{m.createdAt ? new Date(m.createdAt).toLocaleString('ja-JP') : ''}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 bg-card border border-border rounded-lg p-2">
        <div className="text-[10px] font-bold text-sub mb-1">🛡️ 管理人として送る（「@全員」を入れると全員にメンション通知）</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
          placeholder="例）@全員 運営です。10/18の集合場所は〇〇駅に決まりました。"
          className="w-full text-[12px] border border-border rounded-md px-2 py-1.5 bg-bg outline-none" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="mt-1 w-full py-1.5 rounded-md bg-green text-white text-[12px] font-bold disabled:opacity-50">{sending ? '送信中…' : '管理人として送信'}</button>
      </div>
    </details>
  );
}
