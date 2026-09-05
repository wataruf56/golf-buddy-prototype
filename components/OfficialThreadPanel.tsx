'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { LICENSE_LABEL, type License } from '@/lib/officialShared';

// 公式スレッド（運営が代理で立てた枠）の中身。募集中はここで枠に手を挙げる。
//
// ふつうの募集と違うところ:
//   - 主催者がいないので「承認待ち」がない。空きがあれば即参加。
//   - 自分が入れる枠だけ押せる（性別・車の条件はサーバーでも弾く）。
//   - 申し込むときに免許を聞く（A のみ）。集まってから聞くと話が止まるため。
//   - 移動手段が未定なので、申し込む前に「どうなる可能性があるか」を見せる。
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

  return (
    <div className={'bg-card border-2 rounded-card shadow-card p-4 mb-4 ' + c.edge}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={'text-[11px] font-black text-white border-[1.5px] border-border rounded-full px-2.5 py-0.5 ' + c.chip}>
          運営が立てた枠
        </span>
        {women && (
          <span className="text-[11px] font-black bg-white text-sakura border-[1.5px] border-sakura rounded-full px-2.5 py-0.5">
            🌸 女性だけ
          </span>
        )}
        {!recruiting && (
          <span className="text-[11px] font-black bg-green-light text-green border-[1.5px] border-green rounded-full px-2.5 py-0.5">
            人がそろいました
          </span>
        )}
      </div>

      {/* だいたいの開催時期。日付は決めずに出す企画だが、
          「平日なのか土日なのか分からず手を挙げられない」という声があったので、
          選ぶのに足りるだけの粗さで先に見せる。 */}
      {!!t.official.when?.month && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-black bg-white text-text border-2 border-border rounded-lg px-2.5 py-1">
            📅 {t.official.when.month}月{t.official.when.half === 'early' ? '上旬' : '下旬'}ごろ
          </span>
          <span className={'text-[12px] font-black rounded-lg px-2.5 py-1 border-2 '
            + (t.official.when.days === 'weekday'
                ? 'bg-white text-blue border-blue'
                : t.official.when.days === 'weekend'
                  ? 'bg-white text-orange border-orange'
                  : 'bg-white text-sub border-border')}>
            {t.official.when.days === 'weekday' ? '平日に開催'
              : t.official.when.days === 'weekend' ? '土日に開催' : '平日・土日どちらでも'}
          </span>
        </div>
      )}

      <div className={'mt-2.5 border-2 rounded-xl px-3 py-2.5 text-[12px] font-bold leading-relaxed ' + c.soft + ' ' + c.edge}>
        {women ? (
          <>🌸 <b className="text-text">車がなくても大丈夫です。</b>移動は集まってから決めます。</>
        ) : (
          <>🚉 <b className="text-text">{t.official.meetPlace}に集合。</b>車を出す方に乗せてもらいます。</>
        )}
        <br />日程もコースも、<b className="text-text">集まった{t.total}人で決めます。</b>
      </div>

      {/* 顔ぶれを伏せていることを、隠しているのではなく仕様として伝える。
          何も言わずに👤だけ並べると「読み込み中？」に見えるため。 */}
      {!t.revealed && !!t.digest?.count && (
        <div className="mt-2.5 bg-bg border-2 border-hair rounded-xl px-3 py-2 text-[11.5px] font-bold text-sub leading-relaxed">
          👤 いま<b className="text-text">{t.digest.count}人</b>が参加しています。
          <br />どなたが参加しているかは、<b className="text-text">人がそろってから</b>お知らせします。
        </div>
      )}

      {/* 進み具合。**内訳は出さない**（女性2・男性2…と並べると、
          誰が入っているかを推せてしまうし、押せる席を探す作業になる）。
          伝えるのは「あと何人でチャットが始まるか」だけ。 */}
      <div className="mt-3 border-2 border-border rounded-xl bg-white p-3.5">
        <div className="text-center text-[15px] font-black">
          {left > 0
            ? <>あと<span className={c.ink}>{left}人</span>で始まります</>
            : <>人がそろいました</>}
        </div>
        <div className="flex justify-center gap-1.5 mt-2.5">
          {Array.from({ length: t.total }).map((_, i) => (
            <div key={i}
              className={'w-[26px] h-[26px] rounded-full border-2 grid place-items-center text-[12px] '
                + (i < t.taken
                    ? c.btn + ' text-white'
                    : 'border-dashed border-hair text-muted')}>
              {i < t.taken ? '●' : ''}
            </div>
          ))}
        </div>
        <div className="text-[11px] font-bold text-sub text-center mt-2 leading-relaxed">
          {t.taken}人が参加しています
        </div>
      </div>

      {/* 移動と費用の見通し。ここは参加を決める材料なので出す。 */}
      {women ? (
        <div className="mt-3 border-2 border-sakura rounded-xl bg-white p-3">
          <div className="text-[13px] font-black text-sakura">🚗 移動はどうなりますか？</div>
          <div className="text-[11px] font-bold text-sub mt-0.5">集まったメンバーで決めます</div>
          <Row k="車がある人がいれば" v="その車で行きます。ガソリン代と高速代を割り勘" />
          <Row k="全員 車なし＋免許あり" v={<><b>レンタカーになります</b><br />1日8,000円前後 ÷ {t.total}人＝<b>1人{Math.round(8000 / Math.max(1, t.total) / 100) * 100}円前後</b></>} />
          <Row k="免許のある人がいない" v="駅からバスのあるコースを選びます" />
          <NowLine d={t.digest} />
        </div>
      ) : (
        <div className="mt-3 border-2 border-blue rounded-xl bg-white p-3">
          <div className="text-[13px] font-black text-blue">🚉 {t.official.meetPlace}に来られますか？</div>
          <Row k="集合" v={`${t.official.meetPlace}（時間はあとで決めます）`} />
          <Row k="移動" v="車を出す方に乗せてもらいます" />
          <Row k="費用" v={<>ガソリン代・高速代を割り勘<br /><span className="text-[10.5px] text-sub">運転する人は少し安くするのがおすすめです</span></>} />
        </div>
      )}

      {/* 参加していない人：ボタン1つ。枠は選ばせない。 */}
      {recruiting && !t.joined && (
        <>
          {t.official.askLicense && (
            <div className="mt-3">
              <div className="text-[13.5px] font-black">🚗 運転免許はありますか？</div>
              <div className="text-[11px] font-bold text-sub mt-0.5">レンタカーになったときに必要です</div>
              <div className="space-y-2 mt-2">
                {LIC.map((k) => (
                  <button key={k} onClick={() => setLicense(k)}
                    className={'w-full py-3 rounded-xl text-[13.5px] font-black border-2 '
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
            どなたが参加しているかは、<b className="text-text">人がそろってから</b>分かります。<br />
            そろうとグループチャットが始まります。
          </div>
        </>
      )}

      {/* 参加している人 */}
      {t.joined && (
        <div className="mt-4">
          {recruiting ? (
            <>
              <div className="bg-green-light border-2 border-green rounded-xl py-3 text-center text-[14px] font-black text-green leading-relaxed">
                ✅ 参加しています<br />
                <span className="text-[11.5px] font-bold">
                  あと{left}人そろったら、グループチャットが始まります
                </span>
              </div>
              <div className="text-[11px] font-bold text-sub text-center mt-2 leading-relaxed">
                そろったらお知らせします。それまで待っていてください。
              </div>
            </>
          ) : (
            <a href={`/round/${roundId}/chat`}
              className="block w-full py-3.5 rounded-xl text-[15px] font-black border-2 bg-green text-white border-green text-center">
              💬 グループチャットを開く
            </a>
          )}

          {/* 抜け道は必ず出す。入ったら抜けられない状態にはしない。 */}
          <button onClick={leave} disabled={busy}
            className="w-full mt-2 py-3 rounded-xl text-[13px] font-bold bg-card text-red border-2 border-red disabled:opacity-50">
            参加を取り消す
          </button>
        </div>
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
