'use client';

import { loginLabel } from '@/lib/loginLabel';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { FriendTodoBanner } from '@/components/FriendTodoBanner';
import { toast } from '@/components/Toast';
import { chatIdFor, formatDate } from '@/lib/utils';
import { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from '@/lib/adminManagerId';
import { Portal } from '@/components/Portal';
import { AvailNudgeBox } from '@/components/AvailNudgeBox';

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
// （相互マッチ）を、それぞれラベル付きで1覧に表示する。
// 2026-10-13：「一緒に回った人」「メッセージした相手」はリストから外した。DM できる相手（lib/dmPolicy）と
// このリストを一致させるため。以前は募集の主催者に問い合わせただけの人が、終了後もここに残って DM できた。
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
    // 飲み会は「また回りたい」等のマッチングを持たないので、この編集導線には出さない。
    .filter((r) => r.eventType !== 'drink' && r.status === 'completed' && (r.hostId === meId || (r.applicantIds || []).includes(meId)))
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    });

  // 「候補日」→ 再会セッションを用意してカレンダーへ。
  const [rematchBusy, setRematchBusy] = useState('');
  // 「行ける日」で声をかける相手（下から出るシート・2026-10-11）
  const [nudgeTo, setNudgeTo] = useState<{ id: string; name: string } | null>(null);
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
  const [loaded, setLoaded] = useState(false);
  // タブ：friends=友達リスト / comp=過去に同じコンペに参加した人。
  const [tab, setTab] = useState<'friends' | 'comp'>('friends');
  const [compIds, setCompIds] = useState<string[]>([]);
  const [compUsers, setCompUsers] = useState<Record<string, MUser>>({});
  const [compDm, setCompDm] = useState<Set<string> | null>(null);   // DMできる人（できない人には友達申請）

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/matches', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (d?.matches) setMatches(d.matches);
        if (d?.users) setMatchUsers(d.users);
      } catch { /* noop */ } finally { if (!cancelled) setLoaded(true); }
    })();
    (async () => {
      try {
        const res = await fetch('/api/me/comp-participants', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d?.participants)) setCompIds(d.participants);
        if (d?.users) setCompUsers(d.users);
        if (Array.isArray(d?.dmAllowed)) setCompDm(new Set(d.dmAllowed));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 各カテゴリの集合（ブロック・自分を除外）。
  const friendSet = new Set((me.friendIds || []).filter((id) => !blocked.has(id) && id !== meId));
  const againSet = new Set(Object.keys(matches).filter((id) => matches[id]?.again && !blocked.has(id) && id !== meId));
  const romanticSet = new Set(Object.keys(matches).filter((id) => matches[id]?.romantic && !blocked.has(id) && id !== meId));

  // 表示対象（また回りたい／気になる／QR友達）＝ DM を送れる相手（lib/dmPolicy）と同じ範囲。重複なしで集約し、
  // 「ログインが新しい順」（lastActiveAt 降順）で並べる。最終ログイン不明の人は末尾。
  // 「一緒に回っただけ」「メッセージしただけ」の人は載せない（2026-10-13・友達ではないのに DM できた抜け道の解消）。
  const memberSet = new Set<string>();
  for (const id of [...againSet, ...romanticSet, ...friendSet]) memberSet.add(id);
  const lastActiveOf = (id: string): number => (users.find((x) => x.id === id) as any)?.lastActiveAt || 0;
  const order = Array.from(memberSet).sort((a, b) => lastActiveOf(b) - lastActiveOf(a));
  const seen = memberSet; // comp タブの重複除外に流用（従来どおり）。

  // 過去に同じコンペに参加した人。ブロック・自分に加えて、すでに友達リスト(order)に
  // 載っている人（また回りたい/気になる/QR友達/一緒に回った）は重複するので除外する。
  const compList = compIds.filter((id) => !blocked.has(id) && id !== meId && !seen.has(id));

  function userOf(id: string): MUser {
    return (users.find((x) => x.id === id) as any) || matchUsers[id] || compUsers[id] || { displayName: 'ゴルファー' };
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-2 pb-1 text-2xl font-black tracking-tight">友達</div>
      <div className="px-5 pb-3 text-[13px] text-sub">
        QRや友達申請でつながった友達／レビューで「行きたい」「💘 気になる」同士の人が集まります（メッセージを送れる相手）。<b className="text-text">ログインが新しい順</b>に表示（名前の下に最終ログイン）。タップでプロフィール、💬でメッセージ。募集の主催者への連絡は、募集ページの「❓ 主催者に質問」から。
      </div>

      {/* 🛡️ 管理者にDM（運営への問い合わせ窓口）。2026-10-13：マイページに入口が無いので、
          問い合わせはここに一本化（使い方ページの「わからないことがあったら」もここを案内）。
          友達／同じコンペ どちらの切り替えでも見えるよう、一番上に固定。行き先は管理人（ADMIN_MANAGER_ID）とのDM。 */}
      {(() => {
        const cid = chatIdFor(meId, ADMIN_MANAGER_ID);
        const chat = chats.find((c) => c.id === cid);
        const unread = chat?.unreadCount[meId] || 0;
        return (
          <div className="px-5 pb-3">
            <Link href={`/chat/${cid}?other=${ADMIN_MANAGER_ID}`} className="bg-card rounded-card p-3.5 shadow-card flex items-center gap-3 border-[2.5px] border-border">
              <div className="w-11 h-11 rounded-full bg-green-light flex items-center justify-center text-[22px] flex-shrink-0 border-2 border-border">🛡️</div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-black">管理者にDM<span className="ml-1.5 text-[10px] font-black text-green bg-green-light border border-green rounded-full px-1.5 py-0.5">運営（{ADMIN_MANAGER_NAME}）</span></div>
                <div className="text-[11px] text-sub mt-0.5 leading-snug">わからないこと・困りごと・不具合・通報後のやりとりはこちら</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                <span className="text-lg">💬</span>
              </div>
            </Link>
            {/* 💡 改修要望（システム要望）の小さな導線（2026-10-13）。「こんな機能がほしい」「こうだったらいいのに」を
                運営に伝える。要望ごとにスレッド＝運営とチャット／ほかの会員も読めて👍で後押し。個人の相談・通報は上のDMへ。 */}
            <Link href="/requests" className="mt-1.5 flex items-center gap-1.5 px-2 py-1 text-[11.5px] font-bold text-sub">
              <span>💡</span>
              <span className="flex-1 min-w-0 truncate">こんな機能がほしい・こうだったらいいのに（改修要望）</span>
              <span className="text-muted">›</span>
            </Link>
          </div>
        );
      })()}

      {/* 友達申請・QRの「同じ組？」・評価のやり残し（既存のタブ構成には触らない） */}
      <div className="px-5"><FriendTodoBanner variant="banner" /></div>

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
            過去に<b>同じコンペ</b>に参加した人（組が分かれていた人も含む）。友達・マッチの人には💬が出てメッセージを送れます。まだつながっていない人には「🤝 友達申請」が出ます（承認されるとメッセージできます）。
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
                      <LoginAgo at={(u as any).lastActiveAt} />
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Badge className="text-orange bg-orange-light border-orange">🏆 同じコンペ</Badge>
                      </div>
                    </div>
                  </Link>
                  {/* 💬 は DM を送れる相手（lib/dmPolicy＝友達・マッチ）だけ。過去にやり取りがあっても、友達でなければ友達申請（2026-10-13） */}
                  {compDm?.has(id) ? (
                    <Link href={`/chat/${cid}?other=${id}`} className="flex items-center gap-1.5 flex-shrink-0">
                      {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                      <span className="text-lg">💬</span>
                    </Link>
                  ) : compDm ? (
                    <Link href={`/profile/${id}?friend=1`} className="flex-shrink-0 px-2.5 py-1.5 rounded-full bg-green text-white text-[11px] font-black">🤝 友達申請</Link>
                  ) : null}
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
          <div className="px-5 text-[12px] font-black text-sub mb-2">⛳ 過去参加したラウンド（タップで別の組の「回ってみたい」を編集）</div>
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
                <div className="text-[11px] text-blue font-bold mt-2">「回ってみたい」を編集 →</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'friends' && (
      <div className="px-5 pb-24">
        {/* 管理人（運営サポート窓口）の行は、2026-10-13 にページ最上部の「🛡️ 管理者にDM」へ移した。 */}
        {order.length === 0 ? (
          <Empty
            title={loaded ? 'まだ友達がいません' : '読み込み中...'}
            desc="マイページの「QRコードで友達」や友達申請で直接つながるか、一緒に回ったあとのレビューでお互いに「行きたい」を選ぶと増えていきます"
          />
        ) : (
          order.map((id) => {
            const u = userOf(id);
            const cid = chatIdFor(meId, id);
            const chat = chats.find((c) => c.id === cid);
            const unread = chat?.unreadCount[meId] || 0;
            // 2026-10-11：候補日カレンダーは💘（気になる）のマッチだけ。「また回りたい」は「行ける日」で声をかける
            const canRematch = romanticSet.has(id);
            const canNudge = !canRematch && (againSet.has(id) || friendSet.has(id));
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
                    <LoginAgo at={lastActiveOf(id) || (u as any).lastActiveAt} />
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {againSet.has(id) && <Badge className="text-green bg-green-light border-green">🏌️ 行きたい同士</Badge>}
                      {romanticSet.has(id) && <Badge className="text-pink-600 bg-pink-100 border-pink-600">💘 気になる</Badge>}
                      {friendSet.has(id) && <Badge className="text-blue bg-blue-light border-blue">🤝 友達</Badge>}
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
                  {canNudge && (
                    <button onClick={() => setNudgeTo({ id, name: u.displayName })}
                      className="px-2.5 py-1.5 bg-orange text-white rounded-full text-[11px] font-black">📣 声をかける</button>
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
      {nudgeTo && (
        <Portal><div className="fixed inset-0 z-[150] bg-black/45 flex items-end justify-center" onClick={() => setNudgeTo(null)}>
          <div className="bg-bg rounded-t-2xl w-full max-w-[480px] p-4 pb-8 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-black">{nudgeTo.name}さんに声をかける</div>
              <button type="button" onClick={() => setNudgeTo(null)} className="text-sub text-lg px-2" aria-label="閉じる">✕</button>
            </div>
            <AvailNudgeBox partnerId={nudgeTo.id} partnerName={nudgeTo.name} />
          </div>
        </div></Portal>
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

// 名前の下の最終ログイン（2026-10-13・lib/loginLabel）。5分以内は緑の点で「ログイン中」
function LoginAgo({ at }: { at?: number }) {
  const l = loginLabel(at);
  if (!l) return null;
  return (
    <div className={'mt-0.5 flex items-center gap-1 text-[10.5px] font-bold ' + (l.live ? 'text-green' : 'text-muted')}>
      {l.live && <span className="w-1.5 h-1.5 rounded-full bg-green inline-block" aria-hidden />}
      {l.text}
    </div>
  );
}
