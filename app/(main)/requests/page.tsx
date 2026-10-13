'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';
import { useStore } from '@/lib/store';
import { timeAgo } from '@/lib/utils';
import {
  FEATURE_REQUEST_ADMIN_SENDER, FEATURE_REQUEST_BODY_MAX, FEATURE_REQUEST_CATEGORIES, FEATURE_REQUEST_CATEGORY_LABEL,
  FEATURE_REQUEST_STATUS_META, FEATURE_REQUEST_TITLE_MAX,
  type FeatureRequestCategory, type FeatureRequestItem,
} from '@/lib/featureRequests';

// 💡 改修要望の一覧（2026-10-13）。「ゴル友」タブの「管理者にDM」の下の小さな導線から入る。
//   - 誰の要望も読める（会員向けに公開）。書き込めるのは本人と運営。ほかの人は「👍 ほしい」で後押し
//   - 並び＝ピン留め → 最新の動きが新しい順
//   - 「＋ 要望を書く」＝題名（60字）・内容（1000字）・種類チップ
export default function RequestsPage() {
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const [items, setItems] = useState<FeatureRequestItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<FeatureRequestCategory>('feature');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  async function load() {
    try {
      const r = await fetch('/api/requests', { cache: 'no-store', credentials: 'include' });
      const d = await r.json();
      if (r.ok) setItems(d.items || []);
      else setItems([]);
    } catch { setItems([]); }
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    const t = title.trim();
    const b = body.trim();
    if (!t) { toast('題名を入れてください', 'error'); return; }
    if (!b) { toast('内容を入れてください', 'error'); return; }
    if (sending) return;
    setSending(true);
    try {
      const r = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store',
        body: JSON.stringify({ title: t, body: b, category }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d?.error === 'too_fast' ? '少し時間をおいてから、もう一度お願いします' : '送信に失敗しました', 'error');
        return;
      }
      toast('要望を送りました。ありがとうございます！');
      setOpen(false); setTitle(''); setBody('');
      router.push(`/requests/${d.id}`);
    } catch { toast('通信に失敗しました', 'error'); }
    finally { setSending(false); }
  }

  const shown = (items || []).filter((it) => filter === 'all' || it.mine);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-2 pb-1 flex items-center gap-2">
        <Link href="/buddies" className="text-sub text-sm">‹ ゴル友</Link>
      </div>
      <div className="px-5 pb-1 text-2xl font-black tracking-tight">💡 改修要望</div>
      <div className="px-5 pb-3 text-[12.5px] text-sub leading-relaxed">
        「こんな機能がほしい」「こうだったら使いやすい」を運営に伝える場所です。要望ごとにスレッドができ、運営とやり取りできます。<b className="text-text">ほかの人の要望も読めて、「👍 ほしい」で後押し</b>できます。
      </div>

      <div className="px-5 pb-3 flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)}
          className="flex-1 py-2.5 rounded-xl bg-green text-white text-[14px] font-black border-2 border-border shadow-[2px_2px_0_#1E3A30]">＋ 要望を書く</button>
        <div className="flex gap-1 bg-card rounded-full p-1 shadow-card">
          {(['all', 'mine'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded-full text-[11px] font-bold ' + (filter === f ? 'bg-green text-white' : 'text-sub')}>
              {f === 'all' ? 'みんな' : '自分の'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-24">
        {items === null ? (
          <div className="text-center py-16 text-[13px] text-sub">読み込み中...</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 px-5">
            <div className="text-5xl mb-4">💡</div>
            <div className="text-[15px] font-bold mb-2">{filter === 'mine' ? 'まだ要望を出していません' : 'まだ要望はありません'}</div>
            <div className="text-[13px] text-sub">小さなことでも大歓迎です。「＋ 要望を書く」から送ってください</div>
          </div>
        ) : (
          shown.map((it) => <RequestCard key={it.id} item={it} meId={meId} />)
        )}
      </div>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[150] bg-black/45 flex items-end justify-center" onClick={() => !sending && setOpen(false)}>
            <div className="bg-bg rounded-t-2xl w-full max-w-[480px] p-4 pb-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[15px] font-black">💡 要望を書く</div>
                <button type="button" onClick={() => setOpen(false)} className="text-sub text-lg px-2" aria-label="閉じる">✕</button>
              </div>
              <div className="text-[11.5px] text-sub mb-3 leading-relaxed">送った内容は会員に公開されます（名前とアイコンも出ます）。個人的な相談・通報は「🛡️ 管理者にDM」へ。</div>

              <div className="text-[12px] font-black mb-1">種類</div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {FEATURE_REQUEST_CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={'px-3 py-1.5 rounded-full text-[12px] font-bold border-[1.5px] ' + (category === c ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}>
                    {FEATURE_REQUEST_CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>

              <div className="text-[12px] font-black mb-1">題名 <span className="text-muted font-medium">（{title.length}/{FEATURE_REQUEST_TITLE_MAX}）</span></div>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, FEATURE_REQUEST_TITLE_MAX))}
                placeholder="例：募集に「初心者歓迎」の印をつけたい"
                className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-card text-[14px] mb-3" />

              <div className="text-[12px] font-black mb-1">内容 <span className="text-muted font-medium">（{body.length}/{FEATURE_REQUEST_BODY_MAX}）</span></div>
              <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, FEATURE_REQUEST_BODY_MAX))}
                rows={6}
                placeholder={'どんな場面で困った／どうなっていたら嬉しいか、を書いてもらえると助かります。\n例：さがす画面で、初心者歓迎の募集だけに絞れると参加しやすいです。'}
                className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-card text-[14px] leading-relaxed mb-4" />

              <button type="button" onClick={submit} disabled={sending || !title.trim() || !body.trim()}
                className="w-full py-3 rounded-xl bg-green text-white text-[14px] font-black border-2 border-border shadow-[2px_2px_0_#1E3A30] disabled:opacity-50">
                {sending ? '送信中…' : '送る'}
              </button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function RequestCard({ item, meId }: { item: FeatureRequestItem; meId: string }) {
  const st = FEATURE_REQUEST_STATUS_META[item.status] || FEATURE_REQUEST_STATUS_META.new;
  const lastByAdmin = item.lastSenderId === FEATURE_REQUEST_ADMIN_SENDER;
  const d = new Date(item.createdAt);
  const created = item.createdAt ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : '';
  return (
    <Link href={`/requests/${item.id}`} className="block bg-card rounded-card p-3.5 shadow-card mb-2.5 border border-border">
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {item.pinned && <span className="text-[10px] font-black px-1.5 py-px rounded-full border text-orange bg-orange-light border-orange">📌 ピン留め</span>}
        <span className={`text-[10px] font-black px-1.5 py-px rounded-full border ${st.className}`}>{st.label}</span>
        <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-bg text-sub border border-border">{FEATURE_REQUEST_CATEGORY_LABEL[item.category] || 'その他'}</span>
        {item.mine && <span className="text-[10px] font-black text-green">自分の要望</span>}
      </div>
      <div className="text-[15px] font-black leading-snug">{item.title}</div>
      <div className="flex items-center gap-2 mt-2">
        <Avatar user={{ avatar: item.author.avatar, avatarUrl: item.author.avatarUrl, avatarMode: item.author.avatarMode as any, golmotiType: item.author.golmotiType, color: item.author.color || '#2A8C82' } as any} size={22} />
        <span className="text-[11.5px] font-bold text-sub truncate">{item.author.displayName}{item.authorId === meId ? '（あなた）' : ''}</span>
        <span className="text-[10.5px] text-muted">{created}</span>
      </div>
      {item.lastMessage && (
        <div className="mt-2 text-[12px] text-sub leading-snug line-clamp-2">
          <span className={'font-black mr-1 ' + (lastByAdmin ? 'text-green' : 'text-muted')}>{lastByAdmin ? '🛡️ 運営' : item.replyCount > 0 ? '本人' : ''}</span>
          {item.lastMessage}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 text-[11px] font-bold text-muted">
        <span>💬 {item.replyCount} 件の返信</span>
        <span className={item.voted ? 'text-green' : ''}>👍 {item.voteCount} ほしい</span>
        <span className="ml-auto">{timeAgo(item.lastMessageAt || item.createdAt)}</span>
      </div>
    </Link>
  );
}
