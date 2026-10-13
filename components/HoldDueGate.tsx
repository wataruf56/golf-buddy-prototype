'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Portal } from '@/components/Portal';
import { Avatar } from '@/components/Avatar';
import { store, useStore } from '@/lib/store';
import { isRoundHost } from '@/lib/roundHost';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';
import { fmtHoldDeadline } from '@/lib/roundHold';

// 「⏰ 保留にしていた日時になりました」（2026-10-13・lib/roundHold）。
// 主催者・共同管理者に、期日が来た保留の申請を「承認する／今回は見送る」で必ず決めてもらう（閉じるボタンなし）。
//
// 【詰まらせないための約束】
//   ・ポップアップの枠（lib/popupSlot・holdDue 優先98）を使い、ほかの自動ポップアップと同時には出ない。
//     上にあるのは completion（100・その場で完了／中止を選べる）だけ。このポップアップも**その場で選べる**ので、
//     別の画面へ移らないと解けない、ということが無い（どの画面で出ても解ける）。
//   ・中身はサーバー（GET /api/me/hold-due）が決める。募集が消えた・完了・中止・申請者が取り下げた／承認・見送り済みは返らない。
//     押したときに 404・403・409（もう申請中でない）が返ったら、その人をこの画面から外して取り直す。
//   ・押したボタンだけを送信中にし、失敗したらその場にエラーを出して押し直せるようにする（15秒で打ち切り）。
//     失敗が続いたときだけ「いったん閉じる（10分後にまた出す）」を出す（通信が直らないときに閉じ込めない）。
//   ・body にポータルで出し（iOS でタブバーの裏に入らない）、人数が多いときは中だけスクロール。
//   ・ログインしていない・利用停止・管理画面（app/(main) の外なので、そもそも置かれない）では出さない。
type Item = {
  roundId: string; roundTitle: string; roundLabel: string;
  userId: string; name: string;
  avatar?: string; avatarUrl?: string; color?: string; avatarMode?: any; golmotiType?: any;
  gender?: string; age?: number;
  until: number; answer: 'wait' | null;
};
const keyOf = (it: Pick<Item, 'roundId' | 'userId'>) => `${it.roundId}:${it.userId}`;
const SNOOZE_MS = 10 * 60 * 1000;

export function HoldDueGate({ blocked }: { blocked: boolean }) {
  const hydrated = useStore((s) => s.hydrated);
  const meId = useStore((s) => s.meId);
  const banned = useStore((s) => s.banned);
  const rounds = useStore((s) => s.rounds);
  const pathname = usePathname() || '';
  const [items, setItems] = useState<Item[]>([]);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [done, setDone] = useState<Record<string, true>>({});
  const [busyKey, setBusyKey] = useState<string>('');
  const [confirmKey, setConfirmKey] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failCount, setFailCount] = useState(0);
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  const [, setTick] = useState(0);
  const lastLoad = useRef(0);

  const ready = hydrated && !!meId && meId !== 'me' && !banned && !blocked;
  // 自分が主催・共同管理する募集に保留が1件でもあるときだけサーバーに聞く（ふつうの人には通信を増やさない）
  const holdSig = !ready ? '' : rounds
    .filter((r) => isRoundHost(r, meId) && r.holds && Object.keys(r.holds).length > 0)
    .map((r) => `${r.id}:${r.status}:${(r.pendingApplicantIds || []).join('.')}:${Object.entries(r.holds || {}).map(([u, h]) => `${u}@${h?.until}`).join(',')}`)
    .join('|');

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const res = await fetch('/api/me/hold-due', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) return;   // 取れなかったときは前の内容のまま（勝手に消さない・勝手に出さない）
      const j = await res.json().catch(() => null);
      if (!j) return;
      setItems(Array.isArray(j.items) ? j.items : []);
      setNextAt(typeof j.nextAt === 'number' ? j.nextAt : null);
    } catch { /* 通信できないときは次の機会に */ }
  }, []);

  // 保留が増えた・減った・申請者が動いたら取り直す
  useEffect(() => {
    if (!ready || !holdSig) { setItems([]); setNextAt(null); return; }
    load();
  }, [ready, holdSig, load]);
  // 画面を移ったとき・アプリに戻ったとき（間を空けて）
  useEffect(() => {
    if (!ready || !holdSig || Date.now() - lastLoad.current < 15_000) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!ready || !holdSig) return;
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 15_000) load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [ready, holdSig, load]);
  // 次の期日になったら取りに行く（開いたまま期日を迎えても出る）
  useEffect(() => {
    if (!ready || !nextAt) return;
    const ms = Math.max(1_000, Math.min(nextAt - Date.now() + 1_500, 6 * 3600 * 1000));
    const t = setTimeout(() => load(), ms);
    return () => clearTimeout(t);
  }, [ready, nextAt, load]);
  // 「いったん閉じる」の時間が過ぎたら出し直す
  useEffect(() => {
    if (!snoozeUntil) return;
    const t = setTimeout(() => { setSnoozeUntil(0); setFailCount(0); load(); }, Math.max(1_000, snoozeUntil - Date.now()));
    return () => clearTimeout(t);
  }, [snoozeUntil, load]);

  const visible = items.filter((it) => !done[keyOf(it)]);
  const want = ready && visible.length > 0 && !(snoozeUntil > Date.now());
  // ポップアップは同時に1つだけ（lib/popupSlot）。hook は早期 return より前に
  const active = usePopupSlot('holdDue', POPUP_PRIORITY.holdDue, want);

  if (!active || !visible.length) return null;

  async function act(it: Item, kind: 'approve' | 'decline') {
    const k = keyOf(it);
    if (busyKey) return;
    setBusyKey(k);
    setErrors((e) => ({ ...e, [k]: '' }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`/api/rounds/${encodeURIComponent(it.roundId)}/${kind === 'approve' ? 'approve' : 'reject'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: it.userId }), cache: 'no-store', credentials: 'include', signal: ctrl.signal,
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        // 募集が消えた・主催者でなくなった・もう申請中でない → この人は外して取り直す（ここで詰まらせない）
        // （403 でも「性別の枠が満員」gender_full は外さない。理由を出して「今回は見送る」を選べるようにする）
        if (res.status === 404 || (res.status === 403 && j?.error === 'forbidden') || res.status === 401 || j?.error === 'not_pending') {
          setDone((d) => ({ ...d, [k]: true }));
          store.refreshRounds().catch(() => {});
          load();
          return;
        }
        throw new Error(j?.message || `送信できませんでした（${res.status}）`);
      }
      popupEvent('holdDue', kind);
      setDone((d) => ({ ...d, [k]: true }));
      setFailCount(0);
      store.refreshRounds().catch(() => {});
      load();
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      setErrors((x) => ({ ...x, [k]: aborted ? '通信に時間がかかっています。もう一度押してください' : `${(e as Error).message || '送信できませんでした'}。もう一度押してください` }));
      setFailCount((n) => n + 1);
      popupEvent('holdDue', 'error', { kind });
    } finally {
      clearTimeout(timer);
      setBusyKey('');
      setConfirmKey('');
    }
  }

  const sameRound = visible.every((x) => x.roundId === visible[0].roundId);
  const head = visible[0];
  const genderMark = (g?: string) => (g === 'female' ? ' 👩' : g === 'male' ? ' 👨' : '');

  return (
    <Portal>
      <div className="fixed inset-0 z-[290] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="hold-due-title">
        <div className="w-full max-w-[380px] bg-card border-[3px] border-border rounded-[20px] shadow-lg overflow-hidden flex flex-col" style={{ maxHeight: '82dvh' }}>
          <div className="bg-orange text-white px-3 py-3 text-center flex-none">
            <b id="hold-due-title" className="block text-[16px] font-black leading-snug">⏰ 保留にしていた日時になりました</b>
            <small className="block text-[11px] mt-0.5 opacity-90">
              {sameRound ? `${fmtHoldDeadline(head.until)} ・ ${head.roundLabel}` : `${visible.length}人 ・ 期日の早い順`}
            </small>
          </div>
          <div className="px-3 py-3 overflow-y-auto flex-1">
            {visible.map((it) => {
              const k = keyOf(it);
              const busy = busyKey === k;
              const confirming = confirmKey === k;
              return (
                <div key={k} className={visible.length > 1 ? 'bg-bg rounded-2xl p-2.5 mb-2' : 'mb-1'}>
                  {!sameRound && (
                    <div className="text-[10.5px] font-black text-sub mb-1">{it.roundLabel} ・ {fmtHoldDeadline(it.until)}まで</div>
                  )}
                  <div className="flex items-center gap-2">
                    <Avatar user={it as any} size={36} />
                    <div className="min-w-0">
                      <b className="block text-[13.5px] truncate">{it.name}{genderMark(it.gender)}{it.age ? ` ${it.age}歳` : ''}</b>
                      <small className="block text-[11px] text-sub">
                        {it.answer === 'wait' ? '「待つ」と回答して、お返事を待っています' : 'まだ答えていません'}
                      </small>
                    </div>
                  </div>
                  {confirming ? (
                    <>
                      <div className="text-[13px] font-black text-center mt-3 mb-2 leading-snug">{it.name}さんを今回は見送りますか？<br /><span className="text-[11px] font-bold text-sub">{it.name}さんにお知らせが届きます</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={busy} onClick={() => setConfirmKey('')}
                          className="py-3 rounded-xl text-[13.5px] font-black bg-white border-2 border-border disabled:opacity-50">もどる</button>
                        <button type="button" disabled={busy} onClick={() => act(it, 'decline')}
                          className="py-3 rounded-xl text-[13.5px] font-black text-red bg-white border-2 border-red disabled:opacity-50">{busy ? '送信中…' : '見送る'}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[13.5px] font-black text-center mt-3 mb-2">{it.name}さんの参加を承認しますか？</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={busy} onClick={() => act(it, 'approve')}
                          className="py-3 rounded-xl text-[14px] font-black text-white bg-green border-2 border-green disabled:opacity-50">{busy ? '送信中…' : '承認する'}</button>
                        <button type="button" disabled={busy} onClick={() => { setErrors((e) => ({ ...e, [k]: '' })); setConfirmKey(k); }}
                          className="py-3 rounded-xl text-[14px] font-black text-red bg-white border-2 border-red disabled:opacity-50">今回は見送る</button>
                      </div>
                    </>
                  )}
                  {errors[k] && <div className="text-[11.5px] text-red font-bold mt-1.5 leading-relaxed">⚠️ {errors[k]}</div>}
                </div>
              );
            })}
          </div>
          <div className="px-3 pb-3 pt-2 flex-none border-t border-hair text-center">
            <div className="text-[11px] text-sub leading-relaxed">どちらかを選ぶまで、この画面は閉じられません。<br />保留をもう一度延ばすことはできません。</div>
            {failCount >= 2 && (
              <button type="button"
                onClick={() => { popupEvent('holdDue', 'snooze_after_error'); setSnoozeUntil(Date.now() + SNOOZE_MS); setTick((n) => n + 1); }}
                className="mt-1.5 text-[11.5px] font-bold text-blue">通信がうまくいかないときは：いったん閉じる（10分後にもう一度出ます）</button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
