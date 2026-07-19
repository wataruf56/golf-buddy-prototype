'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { store, useStore } from '@/lib/store';
import { chatIdFor } from '@/lib/utils';

// 再会エンジンの画面：候補日カレンダー → 3色重なり → この日で決定 → ラウンド投稿へ。
type Data = {
  pairId: string;
  status: 'notified' | 'inputting' | 'agreed' | 'posted' | 'optedout';
  nextNotifyAt?: number | null;
  candidateWindowDays: number;
  courseName: string;
  roundDate: string;
  matchKind: 'again' | 'romantic';
  myCandidates: string[];
  myPastCandidates?: string[];
  theirCandidates: string[];
  myParty?: string[];
  theirParty?: string[];
  overlap: string[];
  agreedDate: string | null;
  postedRoundId: string | null;
  optedOut: boolean;
  other: { id: string; displayName: string; avatar: string; avatarUrl?: string; age?: number };
};

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mdLabel = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? `${Number(m[2])}/${Number(m[3])}` : s; };
const SIZE_LABEL: Record<string, string> = { '2': '2サム', '3': '3サム', '4': 'フォーサム' };
const partyLabel = (sizes?: string[]) => {
  const s = sizes || [];
  const l = ['2', '3', '4'].filter((k) => s.includes(k)).map((k) => SIZE_LABEL[k]).join('・');
  return l || '未設定';
};
const PARTY_OPTIONS: [string, string][] = [['2', '2サム（2人）でもいい'], ['3', '3サム（3人）でもいい'], ['4', 'フォーサム（4人）でもいい']];

export default function RematchPage() {
  const params = useParams<{ pairId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 表示中の月（その月の1日）。左右で切替。
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  // 過去に入力した候補日を「最初から選択済み」にしたことを知らせるフラグ。
  const [prefilled, setPrefilled] = useState(false);
  const touchX = useRef<number | null>(null);
  // 希望人数（2サム/3サム/フォーサム）設定 ＋ 画面内チャット。
  const meId = useStore((s) => s.meId);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partySel, setPartySel] = useState<Set<string>>(new Set());
  const [partyBusy, setPartyBusy] = useState(false);
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/rematch/${encodeURIComponent(params.pairId)}`, { cache: 'no-store' });
      if (!r.ok) { setNotFound(true); setLoading(false); return; }
      const d: Data = await r.json();
      setData(d);
      const myCands = d.myCandidates || [];
      if (myCands.length > 0) {
        setMine(new Set(myCands));
      } else {
        // 自分の候補が未入力なら、過去に他ペアで入れた候補（今後の範囲内）を
        // 最初から選択済みにする（毎回の入力を省くため）。不要な日はタップで外せる。
        const past = d.myPastCandidates || [];
        setMine(new Set(past));
        setPrefilled(past.length > 0);
      }
      setPartySel(new Set(d.myParty || []));
    } catch { setNotFound(true); }
    setLoading(false);
  }, [params.pairId]);

  useEffect(() => { load(); }, [load]);

  // 画面内チャット（この相手とのDM）。決定・希望人数の通知もここに履歴として残る。
  const otherId = data?.other?.id || '';
  const chatId = meId && otherId ? chatIdFor(meId, otherId) : '';
  const chat = useStore((s) => s.chats.find((c) => c.id === chatId));
  useEffect(() => {
    if (!chatId) return;
    store.loadChat(chatId);
    const iv = setInterval(() => store.loadChat(chatId), 4000);
    return () => clearInterval(iv);
  }, [chatId]);
  useEffect(() => { if (chatId && chat) store.markChatRead(chatId); }, [chatId, chat?.messages.length]);
  useEffect(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight }); }, [chat?.messages.length]);

  async function savePartyPref() {
    setPartyBusy(true);
    try {
      const r = await fetch(`/api/rematch/${encodeURIComponent(params.pairId)}/party`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes: Array.from(partySel) }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      toast('希望人数を保存しました🏌️');
      setPartyOpen(false);
      await load();
      if (chatId) store.loadChat(chatId);
    } catch { toast('保存に失敗しました', 'error'); }
    setPartyBusy(false);
  }
  async function sendChat() {
    const t = chatText.trim();
    if (!t || !otherId || !chatId) return;
    setChatText('');
    try { await store.sendMessage(chatId, otherId, t); }
    catch { toast('送信に失敗しました', 'error'); }
  }

  const theirSet = useMemo(() => new Set(data?.theirCandidates || []), [data]);
  const win = data?.candidateWindowDays || 90;
  // 選択可能な範囲 [今日, 今日+win日]。
  const range = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const mx = new Date(t); mx.setDate(t.getDate() + win);
    return { today: iso(t), maxDate: iso(mx), minMonth: new Date(t.getFullYear(), t.getMonth(), 1), maxMonth: new Date(mx.getFullYear(), mx.getMonth(), 1) };
  }, [win]);

  if (loading) return <div className="p-6 text-sub text-sm">読み込み中...</div>;
  if (notFound || !data) return <div className="p-6 text-sub text-sm">この再会は見つかりませんでした。</div>;

  const other = data.other;
  const agreed = data.status === 'agreed' || data.status === 'posted';
  const overlapNow = Array.from(mine).filter((d) => theirSet.has(d)).sort();
  const bothEntered = mine.size > 0 && theirSet.size > 0;

  const inWindow = (k: string) => k >= range.today && k <= range.maxDate;
  function toggle(k: string) {
    if (agreed || !inWindow(k)) return;
    setMine((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function changeMonth(delta: number) {
    setMonthCursor((c) => {
      const n = new Date(c.getFullYear(), c.getMonth() + delta, 1);
      if (n < range.minMonth || n > range.maxMonth) return c;
      return n;
    });
  }
  const canPrev = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1) > range.minMonth;
  const canNext = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1) < range.maxMonth;
  const monthLead = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();

  async function saveCandidates() {
    setSaving(true);
    try {
      const r = await fetch(`/api/rematch/${encodeURIComponent(params.pairId)}/candidates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: Array.from(mine) }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      toast('候補日を保存しました📅');
      await load();
    } catch { toast('保存に失敗しました', 'error'); }
    setSaving(false);
  }

  async function agree(date: string) {
    if (!(await confirmDialog(`${mdLabel(date)} でラウンドを決定しますか？`))) return;
    try {
      const r = await fetch(`/api/rematch/${encodeURIComponent(params.pairId)}/agree`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(String(r.status));
      toast('再会が決まりました🎉');
      await load();
    } catch { toast('失敗しました', 'error'); }
  }

  async function optout() {
    if (!(await confirmDialog('この相手との再会通知を今後止めますか？'))) return;
    try {
      await fetch(`/api/rematch/${encodeURIComponent(params.pairId)}/optout`, { method: 'POST', cache: 'no-store' });
      toast('再会通知を停止しました');
      router.push('/home');
    } catch { toast('失敗しました', 'error'); }
  }

  return (
    <div className="px-5 py-3 pb-10">
      <div className="flex items-start justify-between mb-3 gap-2">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold mt-0.5">← 戻る</button>
        <div className="text-right">
          {data.nextNotifyAt != null && !agreed && (
            <div className="text-[11px] font-bold text-sub whitespace-nowrap mb-0.5">
              🔔 次の通知: {data.nextNotifyAt <= Date.now() ? 'まもなく' : (() => { const d = new Date(data.nextNotifyAt!); return `${d.getMonth() + 1}/${d.getDate()}`; })()}
            </div>
          )}
          <button onClick={optout} className="text-[11px] text-muted underline whitespace-nowrap">この再会通知を止める</button>
        </div>
      </div>

      {/* 相手カード */}
      <div className="bg-green-light border-[1.5px] border-green rounded-card p-4 mb-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden text-3xl flex-shrink-0 border border-border">
          {other.avatarUrl ? <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" /> : (other.avatar || '⛳')}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-black text-green">🔁 また回りたい相手との再会</div>
          <div className="text-base font-black truncate">{other.displayName} さん</div>
          <div className="text-[11px] text-sub">
            {data.roundDate ? `前回 ${mdLabel(data.roundDate)} に` : '前回'}{data.courseName ? `「${data.courseName}」で` : ''}一緒に回りました
          </div>
        </div>
      </div>

      {/* 希望人数（2サム/3サム/フォーサム）。設定ボタンで選択、相手にも共有＆通知される。 */}
      <div className="bg-card rounded-card p-3.5 shadow-card mb-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-[12px] font-black">🏌️ 希望人数（何人で回りたい）</div>
          <button onClick={() => setPartyOpen(true)} className="px-3.5 py-1.5 bg-green text-white rounded-full text-[11px] font-black flex-shrink-0">⚙️ 設定</button>
        </div>
        <div className="text-[11px] text-sub leading-relaxed">
          あなた：<b className="text-text">{partyLabel(data.myParty)}</b>　／　{other.displayName}さん：<b className="text-text">{partyLabel(data.theirParty)}</b>
        </div>
      </div>

      {/* 決定済みバナー（決定後もカレンダーは下に残す） */}
      {agreed && data.agreedDate && (
        <div className="bg-green-light border-[1.5px] border-green rounded-card p-4 mb-3 text-center">
          <div className="text-2xl mb-0.5">🎉</div>
          <div className="text-lg font-black mb-1">{mdLabel(data.agreedDate)} でラウンド決定！</div>
          <div className="text-[12px] text-sub mb-3">このままラウンドを立てて、集合場所などを相談しましょう。</div>
          <a
            href={`/create?rematch=${encodeURIComponent(params.pairId)}`}
            className="block w-full py-3.5 bg-orange text-white rounded-xl text-sm font-black"
          >🏌️ このままラウンドを立てる</a>
          <div className="text-[10px] text-muted mt-2">このボタンは何度でも押せます。同じ日程で複数のラウンドも作成できます。</div>
        </div>
      )}

      {/* 候補日カレンダー（決定後も表示したまま。決定後は閲覧のみ） */}
      <>
          <div className="text-[13px] font-black mb-1">📅 {agreed ? '入力した候補日（決定済み）' : '行ける日をタップ'}</div>
          <div className="text-[11px] text-sub mb-2">{agreed ? '決まった日は緑、あなたの候補は黄で表示。候補日はそのまま残しています。' : 'お互いに行ける日を出し合うと、重なった日が青で表示されます。左右で月を切り替え。'}</div>

          {/* 過去に入力した候補日を最初から反映済み（未決定時のみ・案内） */}
          {!agreed && prefilled && (
            <div className="bg-yellow-light border-[1.5px] border-orange rounded-card p-2.5 mb-2 text-[11px] font-bold text-orange leading-relaxed">
              ✅ 過去に入力した候補日を最初から反映しています。不要な日はタップで外せます。この内容で送るには下の「確定して相手に送る」を押してください。
            </div>
          )}

          {/* カレンダー（月表示・左右で切替） */}
          <div
            className="bg-card rounded-card p-3 shadow-card mb-2 select-none"
            onTouchStart={(e) => { touchX.current = e.changedTouches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
              if (dx <= -40) changeMonth(1); else if (dx >= 40) changeMonth(-1);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => changeMonth(-1)} disabled={!canPrev} className="w-8 h-8 rounded-full bg-bg border border-border text-sm font-black disabled:opacity-30">‹</button>
              <div className="text-[14px] font-black">{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</div>
              <button onClick={() => changeMonth(1)} disabled={!canNext} className="w-8 h-8 rounded-full bg-bg border border-border text-sm font-black disabled:opacity-30">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DOW.map((w, i) => <div key={w} className={`text-center text-[10px] font-bold ${i === 0 ? 'text-red' : i === 6 ? 'text-blue' : 'text-muted'}`}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: monthLead }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dnum = i + 1;
                const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dnum);
                const k = iso(dt);
                const usable = inWindow(k);
                const isMine = mine.has(k);
                const isTheirs = theirSet.has(k);
                const isOverlap = isMine && isTheirs;
                const isAgreedDate = agreed && k === data.agreedDate;
                let style: React.CSSProperties = {};
                if (!usable) style = { background: '#f3f1ea', color: '#c9c3b8', borderColor: '#eee' };
                else if (isAgreedDate) style = { background: '#2A8C82', color: '#fff', borderColor: '#33271B' };
                else if (isOverlap) style = { background: '#3AA0C9', color: '#fff', borderColor: '#33271B' };
                else if (isMine) style = { background: '#F6C445', color: '#33271B', borderColor: '#33271B' };
                else if (isTheirs) style = { background: '#DADADA', color: '#6b5440', borderColor: '#c9c3b8' };
                else style = { background: '#fff', borderColor: '#e3ddd0' };
                return (
                  <button key={k} onClick={() => toggle(k)} disabled={!usable}
                    className="aspect-square rounded-lg border text-[12px] font-bold flex items-center justify-center"
                    style={style}
                  >{dnum}</button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold text-sub mb-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#F6C445', border: '1px solid #33271B' }} />自分</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#DADADA' }} />相手</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#3AA0C9' }} />重なり</span>
            {agreed && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#2A8C82' }} />決定</span>}
          </div>

          {/* 保存・決定の操作は未決定時のみ。決定後はカレンダーを閲覧のまま残す。 */}
          {!agreed && (
            <>
              <button onClick={saveCandidates} disabled={saving} className="w-full py-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50 mb-3">
                {saving ? '送信中…' : `この候補日で確定して相手に送る（${mine.size}日）`}
              </button>

              {/* 重なり / ガイド */}
              {overlapNow.length > 0 ? (
                <div className="bg-blue-light border-[1.5px] border-blue rounded-card p-4">
                  <div className="text-[12px] font-black text-blue mb-2">🔵 両者が行ける日（タップで決定）</div>
                  <div className="flex flex-wrap gap-2">
                    {overlapNow.map((d) => (
                      <button key={d} onClick={() => agree(d)} className="px-3 py-2 bg-blue text-white rounded-full text-[13px] font-black">
                        {mdLabel(d)} で決定 →
                      </button>
                    ))}
                  </div>
                </div>
              ) : theirSet.size === 0 ? (
                <div className="text-[12px] text-sub bg-bg rounded-xl p-3 text-center">
                  あなたの候補を保存しました。相手が候補を入れると、重なった日がここに表示されます。
                </div>
              ) : bothEntered ? (
                <div className="text-[12px] text-sub bg-bg rounded-xl p-3 text-center leading-relaxed">
                  今回は都合が合いませんでした。候補日を増やすか、また後日お声がけします。
                </div>
              ) : null}
            </>
          )}
        </>

      {/* 画面内チャット（この相手とのDM）。日程の決定・希望人数の設定もここに届く。 */}
      <div className="mt-5">
        <div className="text-[13px] font-black mb-1">💬 {other.displayName}さんとやりとり</div>
        <div className="text-[11px] text-sub mb-2">日程の決定や希望人数の設定は、ここに履歴として届きます。自由にメッセージもできます。</div>
        <div className="bg-card rounded-card shadow-card overflow-hidden">
          <div ref={chatScrollRef} className="max-h-64 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {(chat?.messages || []).length === 0 ? (
              <div className="text-center text-[12px] text-muted py-6">まだメッセージはありません</div>
            ) : (
              (chat?.messages || []).map((m: any) => {
                const mineMsg = m.senderId === meId;
                return (
                  <div key={m.id} className={`flex ${mineMsg ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-3 py-2 text-[13px] leading-relaxed ${mineMsg ? 'bg-green text-white' : 'bg-bg text-text'}`}
                      style={{ borderRadius: mineMsg ? '12px 12px 4px 12px' : '12px 12px 12px 4px' }}
                    >{m.text}</div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex gap-2 p-2.5 border-t border-border">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              placeholder="メッセージを入力…"
              className="flex-1 px-3 py-2 border-[1.5px] border-border rounded-full text-[13px] outline-none bg-bg"
            />
            <button onClick={sendChat} className="px-4 py-2 bg-green text-white rounded-full text-[12px] font-bold flex-shrink-0">送信</button>
          </div>
        </div>
      </div>

      {/* 希望人数の設定モーダル（複数選択可＝「〜でもいい」） */}
      {partyOpen && (
        <div className="absolute inset-0 z-[120] bg-black/50 flex items-center justify-center p-5 backdrop-blur-sm" onClick={() => setPartyOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-card w-full max-w-[340px] p-5 shadow-lg">
            <div className="text-base font-black mb-1">🏌️ 希望人数</div>
            <div className="text-[12px] text-sub mb-3 leading-relaxed">何人で回るのがOKか、当てはまるものを選んでください（複数可）。相手にも共有・通知されます。</div>
            <div className="flex flex-col gap-2 mb-4">
              {PARTY_OPTIONS.map(([k, label]) => {
                const on = partySel.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => setPartySel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                    className={'py-3 rounded-xl text-sm font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
                  >{on ? '✓ ' : ''}{label}</button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPartyOpen(false)} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold">キャンセル</button>
              <button onClick={savePartyPref} disabled={partyBusy} className="flex-[2] py-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50">{partyBusy ? '保存中…' : '保存する'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
