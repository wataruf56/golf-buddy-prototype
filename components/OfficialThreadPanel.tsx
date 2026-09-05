'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { LICENSE_LABEL, type License } from '@/lib/officialShared';

// 公式スレッド（運営が代理で立てた枠）の中身。
//
// ふつうの募集と違うところ:
//   - 主催者がいないので「承認待ち」がない。空きがあれば即参加。
//   - どの席に座るかは会員に選ばせない。性別と車の有無からサーバーが決める。
//   - **募集中は画面をここまで削る**。出すのは状態と、押せるボタン1つだけ。
//     枠の内訳・顔ぶれ・移動の説明まで並べると、そこから誰が入っているかを
//     推せてしまうし、そもそも読む量が多すぎて何をすればいいか分からない。
//     費用や集合場所の話は、そろってからチャットでできる。
type Slot = {
  id: string; gender: 'male' | 'female' | 'any'; count: number;
  role: 'any' | 'driver' | 'rider'; minDrivers?: number; note?: string;
  taken: string[]; takenCount?: number; left: number; drivers: number; driverOnly: boolean;
};
type Member = { id: string; displayName?: string; avatar?: string; avatarUrl?: string; color?: string; car?: string };
type Thread = {
  id: string; title: string; taken: number; total: number; joined: boolean;
  official: { pattern: 'women' | 'meetup'; meetPlace?: string; askLicense: boolean; stage: string; expiresAt: number;
    when?: { year: number; month: number; half: 'early' | 'late'; days: 'weekday' | 'weekend' | 'any' } };
  slots: Slot[]; members: Member[];
  /** 顔ぶれを見せてよいか（満席になったか、自分が入っているか）。 */
  revealed?: boolean;
  /** 誰かは伏せたままの人数まとめ。 */
  digest?: { count: number; withCar: number };
};

const LIC: License[] = ['have', 'paper', 'none'];

export function OfficialThreadPanel({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [t, setT] = useState<Thread | null>(null);
  const [me, setMe] = useState<{ id: string; gender?: string; car?: string } | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // 同時開催に対応。id を指定しないと、動いている別の枠が返ってきて
      // 2本目以降の枠でパネルが出なくなる。
      const r = await fetch(`/api/official?id=${encodeURIComponent(roundId)}`,
        { cache: 'no-store', credentials: 'include' });
      const j = await r.json();
      const t = (j?.threads || []).find((x: Thread) => x.id === roundId) || null;
      if (t) { setT(t); setMe(j.me || null); }
      else setT(null);
    } catch { setT(null); }
  }, [roundId]);
  useEffect(() => { load(); }, [load]);

  if (!t) return null;

  /**
   * この人が入れるか。**どの席か**は聞かない（会員には内訳を見せない）ので、
   * 「どこか1つでも座れる席があるか」だけを見る。
   * サーバー側の canJoinSlot と同じ判定を、押せる／押せないの見た目に写している。
   */
  function blockedReason(): string | null {
    if (t!.joined) return null;
    const fits = t!.slots.filter((s) => {
      if (s.left <= 0) return false;
      if (s.gender !== 'any' && me?.gender !== s.gender) return false;
      if ((s.role === 'driver' || s.driverOnly) && me?.car !== 'have') return false;
      return true;
    });
    if (fits.length) return null;
    // 入れない理由を、いちばん具体的なもので伝える。
    const anyLeft = t!.slots.some((s) => s.left > 0);
    if (!anyLeft) return '締め切りました（満席です）';
    const genderLeft = t!.slots.some((s) => s.left > 0 && (s.gender === 'any' || me?.gender === s.gender));
    if (!genderLeft) return me?.gender === 'male' ? '男性の枠は埋まりました' : '女性の枠は埋まりました';
    return '残りは車を出せる方の枠です';
  }

  async function join() {
    if (t!.official.askLicense && !license) { toast('運転免許について選んでください', 'error'); return; }
    setBusy(true);
    try {
      // slotId は送らない。どの席に座るかは、性別と車の有無からサーバーが決める。
      const r = await fetch(`/api/official/${roundId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.message || '参加できませんでした');
      toast(j.filled ? '🎉 人がそろいました！チャットが始まりました' : '参加しました');
      if (j.filled) router.push(`/round/${roundId}/chat`);
      else await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function leave() {
    if (!(await confirmDialog('この枠から抜けますか？'))) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/rounds/${roundId}/leave`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: '{}', credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || '取り消せませんでした');
      toast('参加を取り消しました');
      router.push('/home');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const recruiting = t.official.stage === 'recruiting';
  const left = Math.max(0, t.total - t.taken);
  // 女性だけの枠は桜色、駅に集まる枠は朱色。企画の性格を色で分ける。
  // 台紙はクリームのまま（アプリの他のカードと同じ）にして、色は縁と印にだけ乗せる。
  // 全面をピンクで塗ると、この画面だけ別のサービスに見えてしまう。
  const women = t.official.pattern === 'women';
  const c = women
    ? { edge: 'border-sakura', chip: 'bg-sakura', btn: 'bg-sakura border-sakura',
        soft: 'bg-sakura-light', ink: 'text-sakura' }
    : { edge: 'border-orange', chip: 'bg-orange', btn: 'bg-orange border-orange',
        soft: 'bg-orange-light', ink: 'text-orange' };
  const blocked = blockedReason();

  // ── 参加している人：これだけ ──────────────────────────
  // 状態と抜け道の2つだけ。募集中は何も決まっていないのだから、
  // 見せるものも、できることも本当にこれしかない。
  if (recruiting && t.joined) {
    return (
      <div className="bg-card border-2 border-green rounded-card shadow-card p-5 mb-4">
        <div className="text-center text-[20px] font-black text-green leading-relaxed">
          参加中
          <div className="text-[14px] font-bold text-text mt-1">{t.total}人集まったら始まります</div>
        </div>
        <button onClick={leave} disabled={busy}
          className="w-full mt-4 py-3.5 rounded-xl text-[15px] font-black bg-card text-red border-2 border-red disabled:opacity-50">
          退出する
        </button>
      </div>
    );
  }

  // ── まだ参加していない人：判断に要るものだけ ────────────
  // 「いつ・どこに集まるか」と「参加する」ボタン。
  // 枠の内訳も顔ぶれも出さない。費用や移動の話は、そろってからチャットでできる。
  if (recruiting) {
    return (
      <div className={'bg-card border-2 rounded-card shadow-card p-4 mb-4 ' + c.edge}>
        <span className={'inline-block text-[11px] font-black text-white rounded-full px-2.5 py-0.5 ' + c.chip}>
          運営が立てた枠
        </span>

        <div className="mt-2.5 text-[14px] font-black leading-relaxed">
          {!!t.official.when?.month && (
            <div>
              📅 {t.official.when.month}月{t.official.when.half === 'early' ? '上旬' : '下旬'}ごろ・
              {t.official.when.days === 'weekday' ? '平日' : t.official.when.days === 'weekend' ? '土日' : '平日/土日'}
            </div>
          )}
          <div className="mt-0.5">
            {women ? '🌸 女性だけでラウンド' : `🚉 ${t.official.meetPlace}に集合`}
          </div>
        </div>

        {t.official.askLicense && (
          <div className="mt-3">
            <div className="text-[13px] font-black">🚗 運転免許はありますか？</div>
            <div className="space-y-2 mt-1.5">
              {LIC.map((k) => (
                <button key={k} onClick={() => setLicense(k)}
                  className={'w-full py-2.5 rounded-xl text-[13px] font-black border-2 '
                    + (license === k ? c.btn + ' text-white' : 'bg-white border-border')}>
                  {license === k ? '✓ ' : ''}{LICENSE_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {blocked ? (
          <div className="mt-3 bg-bg border-2 border-hair rounded-xl py-3 text-center text-[13px] font-black text-muted">
            {blocked}
          </div>
        ) : (
          <button disabled={busy} onClick={join}
            className={'w-full mt-3 py-4 rounded-xl text-[16px] font-black border-2 text-white disabled:opacity-50 ' + c.btn}>
            {busy ? '送信中...' : '参加する'}
          </button>
        )}

        <div className="mt-2.5 text-[11px] font-bold text-sub text-center leading-relaxed">
          {t.total}人集まったら始まります。<br />
          どなたが参加しているかは、そろってから分かります。
        </div>
      </div>
    );
  }

  // ── そろったあと ────────────────────────────────────
  return (
    <div className="bg-card border-2 border-green rounded-card shadow-card p-4 mb-4">
      <span className="inline-block text-[11px] font-black bg-green-light text-green border-[1.5px] border-green rounded-full px-2.5 py-0.5">
        人がそろいました
      </span>
      {t.joined && (
        <>
          <a href={`/round/${roundId}/chat`}
            className="block w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-green text-white text-center">
            💬 グループチャットを開く
          </a>
          {/* 抜け道は必ず出す。入ったら抜けられない状態にはしない。 */}
          <button onClick={leave} disabled={busy}
            className="w-full mt-2 py-3 rounded-xl text-[14px] font-black bg-card text-red border-2 border-red disabled:opacity-50">
            退出する
          </button>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-[11.5px] font-bold leading-relaxed mt-2 pt-2 border-t border-dashed border-hair">
      <span className="w-[86px] flex-none font-black">{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** 顔ぶれは伏せたまま「いま何人・うち車あり何人」だけ伝える。
 *  レンタカーになるかどうかは参加の判断に効くので、ここは隠さない。 */
function NowLine({ d }: { d?: { count: number; withCar: number } }) {
  if (!d || !d.count) return null;
  const allNoCar = d.withCar === 0;
  return (
    <div className="mt-2.5 bg-sakura-light border-2 border-sakura rounded-xl px-2.5 py-2 text-[11.5px] font-black leading-relaxed">
      いま参加中の{d.count}人は{allNoCar ? <>全員<b>車なし</b>です。<br />このままだと<b>レンタカー</b>になりそうです。</>
        : <>うち{d.withCar}人が<b>車あり</b>です。</>}
    </div>
  );
}
