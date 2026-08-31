'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
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
  taken: string[]; left: number; drivers: number; driverOnly: boolean;
};
type Member = { id: string; displayName?: string; avatar?: string; avatarUrl?: string; color?: string; car?: string };
type Thread = {
  id: string; title: string; taken: number; total: number; joined: boolean;
  official: { pattern: 'women' | 'meetup'; meetPlace?: string; askLicense: boolean; stage: string; expiresAt: number };
  slots: Slot[]; members: Member[];
};

const GENDER_LABEL: Record<string, string> = { female: '👩 女性', male: '👨 男性', any: '👥 どなたでも' };
const LIC: License[] = ['have', 'paper', 'none'];

export function OfficialThreadPanel({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [t, setT] = useState<Thread | null>(null);
  const [me, setMe] = useState<{ id: string; gender?: string; car?: string } | null>(null);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);
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

  const membersById: Record<string, Member> = {};
  t.members.forEach((m) => { membersById[m.id] = m; });

  // この人がこの枠に入れるか（サーバーと同じ判定を、押せる／押せないの見た目に反映）
  function why(s: Slot): string | null {
    if (t!.joined) return 'すでに参加しています';
    if (s.left <= 0) return '埋まりました';
    if (s.gender !== 'any' && me?.gender !== s.gender) {
      return s.gender === 'female' ? '女性の方の枠です' : '男性の方の枠です';
    }
    if ((s.role === 'driver' || s.driverOnly) && me?.car !== 'have') return '車を出せる方の枠です';
    return null;
  }

  async function join() {
    if (!pickedSlot) return;
    if (t!.official.askLicense && !license) { toast('運転免許について選んでください', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/official/${roundId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: pickedSlot, license }), credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.message || '参加できませんでした');
      toast(j.filled ? '🎉 人がそろいました！日程を決めましょう' : '参加しました');
      if (j.filled) router.push(`/round/${roundId}/decide`);
      else await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const recruiting = t.official.stage === 'recruiting';
  // 女性だけの枠は桜色、駅に集まる枠は朱色。企画の性格を色で分ける。
  // 台紙はクリームのまま（アプリの他のカードと同じ）にして、色は縁と印にだけ乗せる。
  // 全面をピンクで塗ると、この画面だけ別のサービスに見えてしまう。
  const women = t.official.pattern === 'women';
  const c = women
    ? { edge: 'border-sakura', chip: 'bg-sakura', btn: 'bg-sakura border-sakura',
        soft: 'bg-sakura-light', pick: 'border-sakura bg-sakura-light' }
    : { edge: 'border-orange', chip: 'bg-orange', btn: 'bg-orange border-orange',
        soft: 'bg-orange-light', pick: 'border-green bg-green-light' };

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

      <div className={'mt-2.5 border-2 rounded-xl px-3 py-2.5 text-[12px] font-bold leading-relaxed ' + c.soft + ' ' + c.edge}>
        {women ? (
          <>🌸 <b className="text-text">車がなくても大丈夫です。</b>移動は集まってから決めます。</>
        ) : (
          <>🚉 <b className="text-text">{t.official.meetPlace}に集合。</b>車を出す方に乗せてもらいます。</>
        )}
        <br />日程もコースも、<b className="text-text">集まった{t.total}人で決めます。</b>
      </div>

      {/* 枠 */}
      <div className="mt-3 space-y-2.5">
        {t.slots.map((s) => {
          const blocked = why(s);
          const picked = pickedSlot === s.id;
          return (
            <div key={s.id}
              className={'border-2 rounded-xl p-3 ' +
                (picked ? c.pick
                  : blocked ? 'border-hair bg-white opacity-60'
                  : s.gender === 'female' ? 'border-sakura bg-white'
                  : s.gender === 'male' ? 'border-blue bg-white' : 'border-border bg-white')}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-black">{GENDER_LABEL[s.gender]} ×{s.count}</span>
                <span className={'text-[11px] font-black border rounded-full px-2 py-0.5 '
                  + (s.left > 0 ? 'bg-white border-border' : 'bg-bg border-hair text-muted')}>
                  {s.left > 0 ? `あと${s.left}` : '満席'}
                </span>
              </div>
              {s.note && <div className="text-[11.5px] font-bold text-sub mt-1">{s.note}</div>}
              <div className="flex gap-1.5 mt-2">
                {Array.from({ length: s.count }).map((_, i) => {
                  const uid = s.taken[i];
                  const u = uid ? membersById[uid] : null;
                  if (u) return <Avatar key={i} user={u as any} size={30} emojiSize={15} />;
                  // 空席。女性枠は桜色の点線にして「ここに入れる」を柔らかく見せる。
                  return (
                    <div key={i}
                      className={'w-[30px] h-[30px] rounded-full border-2 border-dashed grid place-items-center text-[13px] '
                        + (s.gender === 'female' ? 'border-sakura text-sakura' : 'border-muted text-muted')}>
                      ＋
                    </div>
                  );
                })}
              </div>
              {/* 車ありが1人入って、残りが車不問に緩んだことを伝える */}
              {!!s.minDrivers && s.drivers >= s.minDrivers && s.left > 0 && (
                <div className="mt-2 bg-green-light border-2 border-green rounded-lg px-2.5 py-2 text-[11.5px] font-black text-green leading-relaxed">
                  ✅ 車を出せる方が{s.drivers}人入りました<br />
                  <span className="font-bold">→ 残りの枠は車がなくてもOKです</span>
                </div>
              )}
              {recruiting && !t.joined && (
                blocked
                  ? <div className="mt-2 text-center text-[11.5px] font-bold text-muted py-2">{blocked}</div>
                  : <button onClick={() => setPickedSlot(picked ? null : s.id)}
                      className={'w-full mt-2 py-2.5 rounded-xl text-[13px] font-black border-2 '
                        + (picked ? c.btn + ' text-white' : 'bg-white border-border')}>
                      {picked ? '✓ この枠を選びました' : 'この枠で参加する'}
                    </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 申し込み（枠を選んだら出る） */}
      {recruiting && !t.joined && pickedSlot && (
        <div className="mt-4 border-t-2 border-hair pt-4">
          {t.official.askLicense && (
            <>
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
            </>
          )}

          {/* 移動の見通し。A は移動手段が未定のまま募集するので、先に伝えておく。 */}
          {women ? (
            <div className="mt-3 border-2 border-sakura rounded-xl bg-white p-3">
              <div className="text-[13px] font-black text-sakura">🚗 移動はどうなりますか？</div>
              <div className="text-[11px] font-bold text-sub mt-0.5">集まったメンバーで決めます</div>
              <Row k="車がある人がいれば" v="その車で行きます。ガソリン代と高速代を割り勘" />
              <Row k="全員 車なし＋免許あり" v={<><b>レンタカーになります</b><br />1日8,000円前後 ÷ {t.total}人＝<b>1人{Math.round(8000 / Math.max(1, t.total) / 100) * 100}円前後</b></>} />
              <Row k="免許のある人がいない" v="駅からバスのあるコースを選びます" />
              <NowLine members={t.members} />
            </div>
          ) : (
            <div className="mt-3 border-2 border-blue rounded-xl bg-white p-3">
              <div className="text-[13px] font-black text-blue">🚉 {t.official.meetPlace}に来られますか？</div>
              <Row k="集合" v={`${t.official.meetPlace}（時間はあとで決めます）`} />
              <Row k="移動" v="車を出す方に乗せてもらいます" />
              <Row k="費用" v={<>ガソリン代・高速代を割り勘<br /><span className="text-[10.5px] text-sub">運転する人は少し安くするのがおすすめです</span></>} />
            </div>
          )}

          <button disabled={busy} onClick={join}
            className={'w-full mt-3 py-3.5 rounded-xl text-[15px] font-black border-2 text-white disabled:opacity-50 ' + c.btn}>
            {busy ? '送信中...' : '承知のうえで参加する'}
          </button>
        </div>
      )}

      {/* 参加済み */}
      {t.joined && (
        <a href={`/round/${roundId}/decide`}
          className="block w-full mt-4 py-3.5 rounded-xl text-[15px] font-black border-2 bg-green text-white border-green text-center">
          📝 決めることを見る
        </a>
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

function NowLine({ members }: { members: Member[] }) {
  if (!members.length) return null;
  const noCar = members.filter((m) => m.car !== 'have').length;
  const allNoCar = noCar === members.length;
  return (
    <div className="mt-2.5 bg-sakura-light border-2 border-sakura rounded-xl px-2.5 py-2 text-[11.5px] font-black leading-relaxed">
      いま参加中の{members.length}人は{allNoCar ? <>全員<b>車なし</b>です。<br />このままだと<b>レンタカー</b>になりそうです。</>
        : <>うち{members.length - noCar}人が<b>車あり</b>です。</>}
    </div>
  );
}
