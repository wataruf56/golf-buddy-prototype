'use client';

import { useEffect, useState } from 'react';
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';
import { Linkify } from '@/components/Linkify';

// 管理画面：ラウンドのグループチャットを閲覧・不適切な発言を削除・「管理人」として発言。
// 2026-10-08：いま入っている人の一覧、メンション（その部屋の人だけ）、定型文テンプレートを追加。
// 送る文 ＝ 「メンション行」（選んだ人の @名前 ／ @全員）＋ 本文。テンプレートは本文だけを差し替える。

type Member = { id: string; displayName: string; gender: string; age: number; car: string; avatar: string; avatarUrl?: string };
type RoundInfo = { title: string; availDate: string; date: string; courseName: string; maxSpots: number };

function dateLabel(d?: string): string {
  if (!d) return '';
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日月火水木金土'[dt.getDay()]}）`;
}

// 定型文。{日付} {人数} {不足} はその部屋の値に置き換える。〇〇 は手で直す。
const TEMPLATES: Array<{ key: string; label: string; body: string }> = [
  { key: 'gathered', label: '👥 人が集まっています', body: '{日付}に行ける人が{人数}人集まっています！\nこの日に回るかどうか、コースや集合場所をここで相談してみませんか？' },
  { key: 'propose', label: '⛳ ラウンドしませんか', body: '{日付}、このメンバーでラウンドしてはいかがですか？⛳\nよければ運営でコースの候補を探します。行けそうな方は「行けます」と返信してください。' },
  { key: 'more', label: '➕ あと少しで1組', body: 'あと{不足}人で1組（4人）になります！\nお知り合いで行けそうな方がいれば、ゴルトモに誘ってみてください。' },
  { key: 'course', label: '📍 コース候補', body: '{日付}のコース候補です。\n・〇〇カントリークラブ（〇:〇〇スタート・〇〇,〇〇〇円）\nご希望や行けない時間があれば教えてください。' },
  { key: 'meet', label: '🚗 集合・乗り合い', body: '集合場所・時間のご案内です。\n〇〇駅 〇:〇〇集合 → 乗り合いでコースへ向かいます。\n車を出せる方は教えてください🙏' },
  { key: 'deadline', label: '⏰ 返信のお願い', body: 'コース予約の都合で、〇/〇（〇）までに参加できるかどうかを返信してください🙏' },
  { key: 'confirm', label: '✅ 決定のお知らせ', body: '{日付}のラウンドが決まりました🎉\n詳細は募集ページに載せています。当日よろしくお願いします！' },
];

export function AdminRoundChat({ token, roundId, defaultOpen = false, label = '💬 ラウンドメッセージを見る' }: { token: string; roundId: string; defaultOpen?: boolean; label?: string }) {
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [info, setInfo] = useState<RoundInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);   // 選んだ人の id。'all' は @全員
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/round-messages?token=${encodeURIComponent(token)}&roundId=${encodeURIComponent(roundId)}`, { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) { setMsgs(d.items || []); setUsers(d.users || {}); setMembers(d.members || []); setInfo(d.round || null); }
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

  const mentionLine = mentions.includes('all')
    ? '@全員'
    : members.filter((m) => mentions.includes(m.id) && m.displayName).map((m) => `@${m.displayName}`).join(' ');
  const finalText = [mentionLine, body.trim()].filter(Boolean).join('\n');

  function toggleMention(id: string) {
    setMentions((prev) => {
      if (id === 'all') return prev.includes('all') ? [] : ['all'];
      const base = prev.filter((x) => x !== 'all');
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }
  function applyTemplate(t: string) {
    const n = members.length;
    const filled = t
      .replace(/\{日付\}/g, dateLabel(info?.availDate || info?.date) || 'この日')
      .replace(/\{人数\}/g, String(n))
      // 次の1組（4人）までの人数。ちょうど割り切れるときは次の組まで4人
      .replace(/\{不足\}/g, String(n % 4 === 0 ? 4 : 4 - (n % 4)));
    setBody(filled);
  }

  async function send() {
    if (!finalText || sending) return;
    if (!(await confirmDialog(`管理人としてこのグループチャットに送りますか？（参加者に通知が届きます）\n\n${finalText}`))) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/round-messages?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId, text: finalText }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      setBody(''); setMentions([]);
      await load();
    } catch { alertDialog('送信に失敗しました'); }
    finally { setSending(false); }
  }

  const chip = (on: boolean) => 'px-2 py-1 rounded-full text-[11px] font-bold border ' + (on ? 'bg-green text-white border-green' : 'bg-bg text-sub border-border');
  return (
    <details
      className="mt-2"
      open={defaultOpen || undefined}
      onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && msgs === null) load(); }}
    >
      <summary className="text-[11px] font-bold text-blue cursor-pointer py-1">{label}</summary>
      <div className="mt-1 flex flex-col gap-1.5">
        {loading && <div className="text-[10px] text-muted">読み込み中...</div>}

        {/* いまこの部屋にいる人 */}
        {msgs && (
          <div className="bg-card border border-border rounded-lg p-2">
            <div className="text-[11px] font-black mb-1">👥 いま入っている人（{members.length}人）</div>
            {members.length === 0
              ? <div className="text-[10px] text-muted">いまは誰もいません</div>
              : <div className="flex flex-wrap gap-1">
                  {members.map((m) => (
                    <span key={m.id} className="text-[11px] bg-bg border border-border rounded-full px-2 py-0.5">
                      {m.displayName || '（名前なし）'}
                      <span className="text-muted text-[10px] ml-1">{[m.gender === 'male' ? '男' : m.gender === 'female' ? '女' : '', m.age ? `${m.age}歳` : '', m.car === 'have' ? '車あり' : ''].filter(Boolean).join('・')}</span>
                    </span>
                  ))}
                </div>}
          </div>
        )}

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

        {msgs && (
          <div className="mt-1 bg-card border border-border rounded-lg p-2">
            <div className="text-[11px] font-black mb-1">🛡️ 管理人として送る</div>

            <div className="text-[10px] font-bold text-sub mb-1">メンション（この部屋の人だけ）</div>
            <div className="flex flex-wrap gap-1 mb-2">
              <button type="button" onClick={() => toggleMention('all')} className={chip(mentions.includes('all'))}>@全員</button>
              {members.map((m) => (
                <button key={m.id} type="button" onClick={() => toggleMention(m.id)} className={chip(mentions.includes(m.id))}>@{m.displayName || '名前なし'}</button>
              ))}
            </div>

            <div className="text-[10px] font-bold text-sub mb-1">テンプレート（押すと本文に入ります。〇〇は書き換えてください）</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" onClick={() => applyTemplate(t.body)} className="px-2 py-1 rounded-md text-[11px] font-bold border border-border bg-bg">{t.label}</button>
              ))}
            </div>

            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000}
              placeholder="本文（テンプレートを押すか、自由に書いてください）"
              className="w-full text-[12px] border border-border rounded-md px-2 py-1.5 bg-bg outline-none" />

            {finalText && (
              <div className="mt-1.5">
                <div className="text-[10px] font-bold text-sub mb-0.5">送る内容（プレビュー）</div>
                <div className="text-[12px] whitespace-pre-wrap break-words bg-[#F3F7FF] border border-[#C9D8F5] rounded-md px-2 py-1.5">{finalText}</div>
              </div>
            )}

            <button onClick={send} disabled={sending || !finalText}
              className="mt-1.5 w-full py-1.5 rounded-md bg-green text-white text-[12px] font-bold disabled:opacity-50">{sending ? '送信中…' : '管理人として送信'}</button>
          </div>
        )}
      </div>
    </details>
  );
}
