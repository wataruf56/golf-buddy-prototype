'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, Fragment } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { store, useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { revisitStar } from '@/lib/utils';
import { resizeImage } from '@/lib/resizeImage';
import { track } from '@/lib/telemetry';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
// メッセージの日付区切り用。年月日＋曜日を必ず出す（何年のメッセージか一目で分かるように）。
function fullDateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
// 同じ日かどうかの判定キー（ローカル時刻ベース）。
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const chat = useStore((s) => s.chats.find((c) => c.id === params.chatId));
  const users = useStore((s) => s.users);
  const noDM = useStore((s) => !!s.restrictions.noDM);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // otherId: from chat participants, or from ?other= query (for new chats with non-buddies)
  const otherIdFromQuery = search?.get('other') || '';
  const otherId = chat?.participants.find((p) => p !== meId) || otherIdFromQuery;
  const storeOther = users.find((u) => u.id === otherId);
  // 相手がストア(users)に居ない場合はAPIで取得する。これが無いと、ゴル友一覧には
  // 出るのにDMを開くと「読み込み中」のまま固まる（一覧は別データでフォールバック
  // 表示できるが、チャットは users からしか相手を引けなかったため）。
  const [fetchedOther, setFetchedOther] = useState<any | null>(null);
  const [otherMissing, setOtherMissing] = useState(false);
  useEffect(() => {
    setFetchedOther(null); setOtherMissing(false);
    if (!otherId || storeOther) return;
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(otherId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (cancelled) return; if (d?.user) setFetchedOther(d.user); else setOtherMissing(true); })
      .catch(() => { if (!cancelled) setOtherMissing(true); });
    return () => { cancelled = true; };
  }, [otherId, !!storeOther]);
  const other = storeOther || fetchedOther;

  // 相手の評価は「また回りたい率」をリアルタイムに算出して表示する（user.reviewAvg は
  // 非正規化で古くなるため使わない。プロフィール上部と同じ track-record を使い一致させる）。
  const [otherTrack, setOtherTrack] = useState<{ roundedWith: number; neverCount: number } | null>(null);
  useEffect(() => {
    setOtherTrack(null);
    if (!otherId) return;
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(otherId)}/track-record`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setOtherTrack({ roundedWith: d.roundedWith || 0, neverCount: d.neverCount || 0 }); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [otherId]);
  const ratingText = otherTrack && otherTrack.roundedWith > 0
    ? `★${revisitStar(otherTrack.roundedWith, otherTrack.neverCount).toFixed(1)}（${otherTrack.roundedWith}）`
    : '🆕 初参加';

  // DM可否（関係性ゲート・lib/dmPolicy と同一判定）。false なら入力欄を出さず案内を表示。
  // 過去のやり取りは読める（閲覧はブロックしない）。
  const [dmAllowed, setDmAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    setDmAllowed(null);
    if (!otherId || !params.chatId) return;
    let cancelled = false;
    fetch(`/api/me/can-dm?userId=${encodeURIComponent(otherId)}&chatId=${encodeURIComponent(params.chatId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setDmAllowed(!!d.allowed); })
      .catch(() => { /* 判定不能時は入力欄を出す（送信時にサーバーが最終判定） */ });
    return () => { cancelled = true; };
  }, [otherId, params.chatId]);

  useEffect(() => {
    if (!params.chatId) return;
    track('dm_open', { to: otherId }); // DMを開いた＋相手（操作ログ用・チャットを開くたび1回）
    store.loadChat(params.chatId);
    const interval = setInterval(() => store.loadChat(params.chatId), 3000);
    return () => clearInterval(interval);
  }, [params.chatId]);

  useEffect(() => {
    if (chat) store.markChatRead(chat.id);
  }, [chat?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat?.messages.length]);

  // DMが制限されている場合は、画面自体を開かせず手前で止める。
  if (noDM) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border">
          <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
          <div className="text-4xl mb-3">🚫</div>
          <div className="text-sm font-black mb-1">ダイレクトメッセージの利用が制限されています</div>
          <div className="text-[12px] text-sub">ご不明な点は運営にお問い合わせください。</div>
        </div>
      </div>
    );
  }

  if (!other) {
    // 相手が取得できなかった場合は無限ローディングにせずエラー表示にする。
    if (otherMissing || !otherId) {
      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-border">
            <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-sm font-black mb-1">相手が見つかりませんでした</div>
            <div className="text-[12px] text-sub">時間をおいて開き直すか、ゴル友一覧から入り直してください。</div>
          </div>
        </div>
      );
    }
    return <div className="p-5 text-sub">読み込み中...</div>;
  }
  // No chat record yet: show empty thread, sending the first message will create it.
  const messages = chat?.messages || [];

  async function send(imageUrl?: string) {
    const t = text.trim();
    if ((!t && !imageUrl) || !other || sending) return;
    setSending(true);
    if (!imageUrl) setText('');
    try { await store.sendMessage(params.chatId, other.id, imageUrl ? '' : t, imageUrl); track('dm_send', { to: other.id }); }
    catch (e) {
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally { setSending(false); }
  }
  async function onPickImage(file: File) {
    if (!file.type.startsWith('image/')) { toast('画像ファイルを選んでください', 'error'); return; }
    setSending(true);
    let dataUrl = '';
    try { dataUrl = await resizeImage(file, 1000, 0.6); }
    catch { toast('画像の読み込みに失敗しました', 'error'); setSending(false); return; }
    setSending(false);
    await send(dataUrl);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card flex-shrink-0 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-xl text-blue">←</button>
        <Link href={`/profile/${other.id}`} className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar user={other} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">{other.displayName}</div>
            <div className="text-[11px] text-sub truncate">タップでプロフィール ・ {ratingText}{other.scoreRange ? ' ・ ' + other.scoreRange : ''}</div>
          </div>
          <span className="text-muted text-sm">›</span>
        </Link>
      </div>

      <div ref={scrollRef} className="flex-1 px-5 py-4 flex flex-col gap-2.5 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center my-10 text-sub text-sm">最初のメッセージを送ってみましょう 💬</div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === meId;
          // 日付が変わる先頭で「YYYY年M月D日(曜)」の区切りを出す（何年何月何日か明確に）。
          const showDivider = i === 0 || dayKey(m.createdAt) !== dayKey(messages[i - 1].createdAt);
          return (
            <Fragment key={m.id}>
              {showDivider && (
                <div className="flex justify-center my-1.5">
                  <span className="text-[10px] font-bold text-sub bg-bg px-3 py-1 rounded-full">{fullDateLabel(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'bg-green text-white' : 'bg-card text-text shadow-card'}`}
                  style={{ borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}
                >
                  {(m as any).imageUrl && (
                    <a href={(m as any).imageUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                      <img src={(m as any).imageUrl} alt="画像" className="rounded-lg max-w-full max-h-60 object-cover" />
                    </a>
                  )}
                  {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                  <div className={`text-[10px] mt-1 text-right ${mine ? 'text-white/60' : 'text-muted'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {dmAllowed === false ? (
        <div className="px-5 py-4 pb-8 bg-card border-t border-border flex-shrink-0 text-center text-[11px] text-sub leading-relaxed">
          💬 メッセージを送れるのは「ゴル友（QRでつながった人）」「一緒にラウンド・コンペを回った人」「参加申請・招待中の相手」「募集中ラウンドの主催者」のみです
        </div>
      ) : (
      <div className="flex items-end gap-2 px-4 py-3 pb-7 bg-card border-t border-border flex-shrink-0">
        {/* 画像添付（ラウンドチャットと同仕様） */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          aria-label="画像を送る"
          className="self-end flex-shrink-0 w-10 h-10 rounded-full text-lg border-[1.5px] bg-bg border-border text-sub disabled:opacity-50"
        >📷</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); if (fileRef.current) fileRef.current.value = ''; }}
        />
        {/* 改行はEnterで入力可。送信は右の送信ボタンのみ（Enterでは送らない）。 */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="メッセージを入力...（改行OK）"
          className="flex-1 px-4 py-2.5 border-[1.5px] border-border rounded-[18px] text-sm outline-none bg-bg resize-none max-h-28"
        />
        <button onClick={() => send()} disabled={sending} aria-label="送信" className="self-end flex-shrink-0 w-10 h-10 bg-green text-white rounded-full text-base font-bold disabled:opacity-50">➤</button>
      </div>
      )}
    </div>
  );
}
