'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { chatIdFor, formatDate } from '@/lib/utils';

type MatchInfo = { again: boolean; romantic: boolean };
type MUser = { displayName: string; avatar?: string; avatarUrl?: string; avatarMode?: string; golmotiType?: string; color?: string; gender?: string; age?: number };

export default function BuddiesPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

// ゴル友＝1つの「友達」リストに統合。QRでつながった友達／また回りたい・気になる
// （相互マッチ）／一緒に回った人を、それぞれラベル付きで1覧に表示する。
function Inner() {
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const chats = useStore((s) => s.chats);
  const users = useStore((s) => s.users);
  const rounds = useStore((s) => s.rounds);
  const blocked = new Set(me.blockedUserIds || []);

  // 過去に自分が主催/参加した完了ラウンド（新しい順）。ここから当時の詳細に飛べば、
  // 同じ組の相手に「また回りたい/気になる」を後からでも付け外しできる。
  const myPastRounds = rounds
    .filter((r) => r.status === 'completed' && (r.hostId === meId || (r.applicantIds || []).includes(meId)))
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    });

  // 「候補日」→ 再会セッションを用意してカレンダーへ。
  const [rematchBusy, setRematchBusy] = useState('');
  async function startRematch(partnerId: string) {
    setRematchBusy(partnerId);
    try {
      const r = await fetch('/api/rematch/ensure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId }), cache: 'no-store', credentials: 'include',
      });
      const d = await r.json();
      if (r.ok && d?.pairId) router.push(`/rematch/${d.pairId}`);
      else toast('再会の準備に失敗しました', 'error');
    } catch { toast('通信に失敗しました', 'error'); }
    finally { setRematchBusy(''); }
  }

  const [matches, setMatches] = useState<Record<string, MatchInfo>>({});
  const [matchUsers, setMatchUsers] = useState<Record<string, MUser>>({});
  const [pastIds, setPastIds] = useState<string[]>([]);
  const [pastUsers, setPastUsers] = useState<Record<string, MUser>>({});
  const [loaded, setLoaded] = useState(false);
  // タブ：friends=友達リスト / comp=過去に同じコンペに参加した人。
  const [tab, setTab] = useState<'friends' | 'comp'>('friends');
  const [compIds, setCompIds] = useState<string[]>([]);
  const [compUsers, setCompUsers] = useState<Record<string, MUser>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/matches', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (d?.matches) setMatches(d.matches);
        if (d?.users) setMatchUsers(d.users);
      } catch { /* noop */ }
    })();
    (async () => {
      try {
        const res = await fetch('/api/me/past-partners', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d?.partners)) setPastIds(d.partners);
        if (d?.users) setPastUsers(d.users);
      } catch { /* noop */ } finally { if (!cancelled) setLoaded(true); }
    })();
    (async () => {
      try {
        const res = await fetch('/api/me/comp-participants', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d?.participants)) setCompIds(d.participants);
        if (d?.users) setCompUsers(d.users);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 各カテゴリの集合（ブロック・自分を除外）。
  const pastSet = new Set(pastIds.filter((id) => !blocked.has(id) && id !== meId));
  const friendSet = new Set((me.friendIds || []).filter((id) => !blocked.has(id) && id !== meId));
  const againSet = new Set(Object.keys(matches).filter((id) => matches[id]?.again && !blocked.has(id) && id !== meId));
  const romanticSet = new Set(Object.keys(matches).filter((id) => matches[id]?.romantic && !blocked.has(id) && id !== meId));

  // 表示順：また回りたい → 気になる → QR友達 → 一緒に回った（重複は先勝ちで1回だけ）。
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of [...againSet, ...romanticSet, ...friendSet, ...pastSet]) {
    if (seen.has(id)) continue;
    seen.add(id); order.push(id);
  }

  // 過去に同じコンペに参加した人。ブロック・自分に加えて、すでに友達リスト(order)に
  // 載っている人（また回りたい/気になる/QR友達/一緒に回った）は重複するので除外する。
  const compList = compIds.filter((id) => !blocked.has(id) && id !== meId && !seen.has(id));

  function userOf(id: string): MUser {
    return (users.find((x) => x.id === id) as any) || matchUsers[id] || pastUsers[id] || compUsers[id] || { displayName: 'ゴルファー' };
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-2 pb-1 text-2xl font-black tracking-tight">友達</div>
      <div className="px-5 pb-3 text-[13px] text-sub">
        QRでつながった友達／また回りたい・気になる・一緒に回った人が集まります。タップでプロフィール、💬でメッセージ。
      </div>

      {/* タブ切替：友達リスト / 過去に同じコンペに参加した人 */}
      <div className="px-5 pb-3 flex gap-2">
        <button
          onClick={() => setTab('friends')}
          className={'flex-1 py-2 rounded-full text-[13px] font-bold border-[1.5px] ' + (tab === 'friends' ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
        >友達</button>
        <button
          onClick={() => setTab('comp')}
          className={'flex-1 py-2 rounded-full text-[13px] font-bold border-[1.5px] ' + (tab === 'comp' ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
        >🏆 同じコンペ参加者{compList.length > 0 ? `（${compList.length}）` : ''}</button>
      </div>

      {/* ── 同じコンペ参加者タブ ── */}
      {tab === 'comp' && (
        <div className="px-5 pb-24">
          <div className="text-[12px] text-sub mb-3 leading-relaxed">
            過去に<b>同じコンペ</b>に参加した人（組が分かれていた人も含む）。💬から直接メッセージを送れます。
          </div>
          {compList.length === 0 ? (
            <Empty title={loaded ? 'まだいません' : '読み込み中...'} desc="コンペ（5人以上）に参加して完了すると、ここに同じコンペの人が表示されます" />
          ) : (
            compList.map((id) => {
              const u = userOf(id);
              const cid = chatIdFor(meId, id);
              const chat = chats.find((c) => c.id === cid);
              const unread = chat?.unreadCount[meId] || 0;
              return (
                <div key={id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
                  <Link href={`/profile/${id}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar user={{ id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, avatarMode: u.avatarMode, golmotiType: u.golmotiType, color: u.color || '#2A8C82' } as any} size={48} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[15px] font-bold truncate">{u.displayName}</span>
                        {u.gender === 'male' ? <span className="text-[11px]">👨</span> : u.gender === 'female' ? <span className="text-[11px]">👩</span> : null}
                        {u.age ? <span className="text-[11px] text-sub font-medium">{u.age}歳</span> : null}
                      </div>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Badge className="text-orange bg-orange-light border-orange">🏆 同じコンペ</Badge>
                      </div>
                    </div>
                  </Link>
                  <Link href={`/chat/${cid}?other=${id}`} className="flex items-center gap-1.5 flex-shrink-0">
                    {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                    <span className="text-lg">💬</span>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 過去参加したラウンド（横スクロール）。タップで当時の詳細へ → 同組の相手に
          「また回りたい/気になる」を後からでも付け外しできる。 */}
      {tab === 'friends' && myPastRounds.length > 0 && (
        <div className="pb-3">
          <div className="px-5 text-[12px] font-black text-sub mb-2">⛳ 過去参加したラウンド（タップで「また回りたい」を編集）</div>
          <div className="flex gap-2.5 overflow-x-auto px-5 pb-1">
            {myPastRounds.map((r) => (
              <Link
                key={r.id}
                href={`/round/${r.id}`}
                className="flex-shrink-0 w-44 bg-card rounded-card p-3 shadow-card border border-border"
              >
                <div className="text-[13px] font-bold truncate">{r.title || r.courseName || 'ラウンド'}</div>
                <div className="text-[11px] text-muted mt-1 truncate">
                  {formatDate(r.date) || r.dateRange || ''}{r.hostId === meId ? ' ・主催' : ' ・参加'}
                </div>
                <div className="text-[11px] text-blue font-bold mt-2">また回りたいを編集 →</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'friends' && (
      <div className="px-5 pb-24">
        {order.length === 0 ? (
          <Empty
            title={loaded ? 'まだ友達がいません' : '読み込み中...'}
            desc="マイページの「QRコードで友達」で直接つながるか、ラウンドで一緒に回ると増えていきます"
          />
        ) : (
          order.map((id) => {
            const u = userOf(id);
            const cid = chatIdFor(meId, id);
            const chat = chats.find((c) => c.id === cid);
            const unread = chat?.unreadCount[meId] || 0;
            const canRematch = againSet.has(id) || romanticSet.has(id);
            return (
              <div key={id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
                <Link href={`/profile/${id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar user={{ id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, avatarMode: u.avatarMode, golmotiType: u.golmotiType, color: u.color || '#2A8C82' } as any} size={48} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[15px] font-bold truncate">{u.displayName}</span>
                      {u.gender === 'male' ? <span className="text-[11px]">👨</span> : u.gender === 'female' ? <span className="text-[11px]">👩</span> : null}
                      {u.age ? <span className="text-[11px] text-sub font-medium">{u.age}歳</span> : null}
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {againSet.has(id) && <Badge className="text-green bg-green-light border-green">🏌️ また回りたい</Badge>}
                      {romanticSet.has(id) && <Badge className="text-pink-600 bg-pink-100 border-pink-600">💘 気になる</Badge>}
                      {friendSet.has(id) && <Badge className="text-blue bg-blue-light border-blue">🤝 QR友達</Badge>}
                      {pastSet.has(id) && !againSet.has(id) && !romanticSet.has(id) && <Badge className="text-sub bg-bg border-border">⛳ 一緒に回った</Badge>}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canRematch && (
                    <button
                      onClick={() => startRematch(id)}
                      disabled={rematchBusy === id}
                      className="px-2.5 py-1.5 bg-green text-white rounded-full text-[11px] font-black disabled:opacity-50"
                    >{rematchBusy === id ? '…' : '📅 候補日'}</button>
                  )}
                  <Link href={`/chat/${cid}?other=${id}`} className="flex items-center gap-1.5">
                    {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                    <span className="text-lg">💬</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`text-[10px] font-black px-1.5 py-px rounded-full border ${className}`}>{children}</span>;
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center py-16 px-5">
      <div className="text-5xl mb-4">⛳</div>
      <div className="text-[15px] font-bold mb-2">{title}</div>
      <div className="text-[13px] text-sub">{desc}</div>
    </div>
  );
}
