'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appRoundUrl } from '@/lib/adminLinks';

// 運営が代理で立てる募集（公式スレッド）の管理。
//
// 同時に走らせるのは1本まで。ここが「いま何が動いているか」の唯一の場所になる。
// 2本目を作ろうとすると API が 409 で断るので、この画面でも先に伝えておく。
type Thread = {
  id: string; title: string; createdAt: number;
  official: { pattern: 'women' | 'meetup'; stage: string; meetPlace?: string; expiresAt: number;
    decide?: { course?: string; date?: string; price?: string };
    when?: { year: number; month: number; half: 'early' | 'late'; days: 'weekday' | 'weekend' | 'any' } };
  taken: number; total: number;
};
type Settings = {
  popupTitle: string; popupBody: string; targetGender: '' | 'male' | 'female';
  targetAreas: string[]; snoozeDays: number; filledMessage: string; showFareCard: boolean;
};

const STAGE_LABEL: Record<string, string> = {
  recruiting: '募集中', deciding: '日程を調整中', confirmed: '確定ずみ', closed: '終了',
};
const fmt = (ms?: number) => ms ? new Date(ms).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '—';

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // 新規作成
  const [pattern, setPattern] = useState<'women' | 'meetup'>('women');
  // 声かけは**枠ごと**に持つ（立てた瞬間に写し取られる）。
  // これまでは下の「既定のひな形」がそのまま使われていたので、
  // 駅集合の枠を立てても「女性だけでラウンドしませんか？」が出てしまっていた。
  const [pTitle, setPTitle] = useState('');
  const [pBody, setPBody] = useState('');
  const [pGender, setPGender] = useState<'' | 'male' | 'female'>('female');
  const [pSnooze, setPSnooze] = useState('7');
  const [touched, setTouched] = useState(false);   // 手で直したら既定値で上書きしない
  const [place, setPlace] = useState('新宿');
  const [expireDays, setExpireDays] = useState('14');
  // だいたいの開催時期。日付は決めずに出す企画なので、月と上旬/下旬、
  // それに平日か土日かだけを持つ。既定は「今月の下旬・土日」。
  const now = new Date();
  const [wYear, setWYear] = useState(now.getFullYear());
  const [wMonth, setWMonth] = useState(now.getMonth() + 1);
  const [wHalf, setWHalf] = useState<'early' | 'late'>('late');
  const [wDays, setWDays] = useState<'weekday' | 'weekend' | 'any'>('weekend');

  useEffect(() => {
    const cached = search?.get('token') || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch { /* noop */ }
    })();
  }, [search]);

  // パターンと駅から、その企画に合う既定の文面を作る。
  // 手で直したあとは上書きしない（せっかく書いたものが消えると腹が立つ）。
  useEffect(() => {
    if (touched) return;
    if (pattern === 'women') {
      setPTitle('女性だけでラウンドしませんか？');
      setPBody('コースも日程も、集まってから決めます。\n車がなくても大丈夫です。');
      setPGender('female');
    } else {
      const st = (place || '').trim();
      setPTitle(st ? `${st}に集まってラウンドしませんか？` : '駅に集まってラウンドしませんか？');
      setPBody('コースも日程も、集まってから決めます。\n車を出せる人が一緒なので、車がなくても行けます。');
      setPGender('');   // 駅集合は男女どちらも募るので絞らない
    }
  }, [pattern, place, touched]);

  const load = useCallback(async () => {
    if (!token) return;
    const q = `token=${encodeURIComponent(token)}`;
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/official?all=1&${q}`, { cache: 'no-store' }).then(asJson),
        fetch(`/api/official/settings?${q}`, { cache: 'no-store' }).then(asJson),
      ]);
      setThreads(a?.threads || []);
      setS(b?.settings || null);
    } catch (e) { setMsg('❌ 読み込めませんでした（' + (e as Error).message + '）'); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const actives = threads.filter((t) => t.official.stage === 'recruiting' || t.official.stage === 'deciding');
  const active = actives[0];

  async function create() {
    // 同時開催に対応（2026-08-31）。2本目以降も立てられる。
    // 声かけ文面は枠ごとに写し取られるので、走っている枠の文面は変わらない。
    if (actives.length && !window.confirm(
      `いま${actives.length}本の枠が動いています。もう1本立てますか？
`
      + '（ホームの声かけは、それぞれの枠の対象条件に合う人にだけ出ます）')) return;
    if (!window.confirm('この内容で枠を立てますか？')) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern, meetPlace: pattern === 'meetup' ? place : undefined,
          expireDays: Number(expireDays) || 14,
          when: { year: wYear, month: wMonth, half: wHalf, days: wDays },
          // この枠だけの声かけ。全体のひな形ではなく、ここで決めたものが使われる。
          prompt: {
            popupTitle: pTitle, popupBody: pBody, targetGender: pGender,
            snoozeDays: Number(pSnooze) || 7,
          },
        }),
      });
      const j = await asJson(r);
      if (!j.ok) throw new Error(j?.message || '作れませんでした');
      setMsg(`✅ 「${j.title}」を立てました`);
      await load();
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  // 出しっぱなしの枠を畳む。参加者がいるものは消さずに閉じる（履歴を残す）。
  async function finish(t: Thread, mode: 'close' | 'delete') {
    const q = `?token=${encodeURIComponent(token)}`;
    if (!window.confirm(mode === 'delete' ? 'この枠を削除しますか？' : 'この枠を閉じますか？（履歴には残ります）')) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official/${t.id}${q}`, { method: mode === 'delete' ? 'DELETE' : 'POST' });
      const j = await asJson(r);
      if (!j.ok) throw new Error(j?.message || 'できませんでした');
      setMsg(mode === 'delete' ? '🗑 削除しました' : '✅ 閉じました');
      await load();
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  // 走っている枠の開催時期を後から直す。立て直すと参加者もチャットも失うので、
  // 中身だけ差し替える。
  async function saveWhen(t: Thread, w: { year: number; month: number; half: 'early' | 'late'; days: 'weekday' | 'weekend' | 'any' }) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official/${t.id}?token=${encodeURIComponent(token)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ when: w }),
      });
      const j = await asJson(r);
      if (!j.ok) throw new Error(j?.message || '直せませんでした');
      setMsg('✅ 開催時期を直しました');
      await load();
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveSettings() {
    if (!s) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/official/settings?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
      });
      const j = await asJson(r);
      if (!j.ok) throw new Error('保存できませんでした');
      setMsg('✅ 保存しました');
    } catch (e) { setMsg('❌ ' + (e as Error).message); }
    finally { setBusy(false); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <Link href={`/admin?token=${token}`} className="text-[12px] text-blue font-bold">‹ 管理</Link>
      <div className="text-2xl font-black mt-1 mb-1">📣 運営が立てる枠</div>
      <div className="flex gap-2 mb-3">
        <Link href={`/admin/proxy-funnel?token=${token}`}
          className="flex-1 bg-card rounded-xl shadow-card px-3 py-2.5 border-2 border-border text-center">
          <span className="text-[12.5px] font-black">📊 レポート</span>
          <span className="block text-[10.5px] font-bold text-sub">見た人・入った人</span>
        </Link>
        <Link href={`/admin/group-log?token=${token}`}
          className="flex-1 bg-card rounded-xl shadow-card px-3 py-2.5 border-2 border-border text-center">
          <span className="text-[12.5px] font-black">🚪 入退室ログ</span>
          <span className="block text-[10.5px] font-bold text-sub">誰がいつ入って抜けたか</span>
        </Link>
      </div>
      <div className="text-[11.5px] text-sub font-bold leading-relaxed mb-4">
        主催者を置かずに、枠だけ先に出す募集です。<b className="text-text">同時に走らせるのは1本まで。</b>
        声かけがぶつかって、どちらも埋まらなくなるのを避けるためです。
      </div>

      {msg && <div className="text-[12.5px] font-black text-center mb-3">{msg}</div>}

      {/* いま動いているもの */}
      <div className="bg-card rounded-xl shadow-card p-4 mb-3">
        {/* 同時開催に対応したので、動いている枠は**全部**並べる。
            1本目しか出していなかったため、2本目を閉じることも直すこともできなかった。 */}
        <div className="text-[13px] font-black mb-2">いま動いている枠（{actives.length}本）</div>
        {!actives.length && (
          <div className="text-[12px] text-muted font-bold py-2">ありません。下から立てられます。</div>
        )}
        {actives.map((t) => (
          <div key={t.id} className="border-2 border-orange bg-orange-light rounded-xl p-3 mb-2.5">
            <a href={appRoundUrl(t.id)} className="block">
              <div className="text-[14px] font-black">{t.title}</div>
              <div className="text-[11.5px] font-bold text-sub mt-1">
                {STAGE_LABEL[t.official.stage]} ・ {t.taken}/{t.total}人 ・ 締切 {fmt(t.official.expiresAt)}
              </div>
              {t.official.stage === 'deciding' && (
                <div className="text-[11px] font-bold text-orange mt-1">
                  ⛳ {t.official.decide?.course || '未入力'} / 📅 {t.official.decide?.date || '未入力'} / 💰 {t.official.decide?.price || '未入力'}
                </div>
              )}
            </a>

            <WhenEditor t={t} busy={busy} onSave={saveWhen} />

            <div className="flex gap-2 mt-2.5">
              <button onClick={() => finish(t, 'close')} disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 border-border bg-white disabled:opacity-50">
                閉じる（履歴に残す）
              </button>
              {t.taken === 0 && (
                <button onClick={() => finish(t, 'delete')} disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 border-red text-red bg-white disabled:opacity-50">
                  🗑 削除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 立てる */}
      <div className={'bg-card rounded-xl shadow-card p-4 mb-3 ' + (active ? 'opacity-50' : '')}>
        <div className="text-[13px] font-black mb-2">枠を立てる</div>
        <div className="space-y-2">
          {([['women', '女性だけで、のんびりラウンド', '女性4人。免許を聞きます'],
             ['meetup', '駅に集まってラウンド', '女性2＋男性2。男性の1人は車あり']] as const).map(([k, t, d]) => (
            <button key={k} onClick={() => setPattern(k)}
              className={'w-full text-left p-3 rounded-xl border-2 ' + (pattern === k
                ? (k === 'women' ? 'border-sakura bg-sakura-light' : 'border-orange bg-orange-light')
                : 'border-border bg-white')}>
              <div className="text-[13px] font-black">{pattern === k ? '✓ ' : ''}{k === 'women' ? '🌸 ' : '🚉 '}{t}</div>
              <div className="text-[11px] font-bold text-sub mt-0.5">{d}</div>
            </button>
          ))}
        </div>
        {pattern === 'meetup' && (
          <label className="block mt-3">
            <span className="text-[12px] font-black">集合する駅</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)}
              className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
          </label>
        )}
        {/* 声かけは枠ごと。パターンを選ぶと既定の文面が入れ替わる。
            ここで決めた文面が、立てた瞬間にその枠へ写し取られる。 */}
        <div className="mt-4 pt-3 border-t-2 border-hair">
          <div className="text-[12.5px] font-black mb-1">この枠の声かけ（ホームに出る文）</div>
          <div className="text-[11px] font-bold text-sub mb-2 leading-relaxed">
            上で企画を選ぶと、それに合う文面が入ります。手で直せます。
          </div>
          <Text label="見出し" v={pTitle} on={(v) => { setTouched(true); setPTitle(v); }} />
          <Area label="本文" v={pBody} on={(v) => { setTouched(true); setPBody(v); }} rows={3} />
          <div className="mt-3">
            <div className="text-[12px] font-black mb-1">誰に出すか</div>
            <div className="flex gap-2">
              {([['', 'ぜんいん'], ['female', '女性だけ'], ['male', '男性だけ']] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setTouched(true); setPGender(k); }}
                  className={'flex-1 py-2.5 rounded-xl text-[12px] font-black border-2 ' +
                    (pGender === k ? 'border-green bg-green-light' : 'border-border bg-white')}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="block mt-3">
            <span className="text-[12px] font-black">「あとで」で何日消すか</span>
            <input inputMode="numeric" value={pSnooze}
              onChange={(e) => { setTouched(true); setPSnooze(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')); }}
              className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
          </label>
        </div>

        {/* だいたいの開催時期。
            日付を決めずに人だけ集める企画だが、それだけだと
            「平日なのか土日なのか」が分からず手を挙げられない、という声があった。
            日付は決めないまま、選ぶのに足りる粗さだけをここで決める。 */}
        <div className="mt-4 border-2 border-border rounded-xl p-3">
          <div className="text-[13px] font-black">📅 だいたいの開催時期</div>
          <div className="text-[11px] font-bold text-sub mt-0.5 leading-relaxed">
            日付は決めません。募集カードに「{wMonth}月{wHalf === 'early' ? '上旬' : '下旬'}ごろ・
            {wDays === 'weekday' ? '平日' : wDays === 'weekend' ? '土日' : '平日/土日'}」と出ます。
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="block">
              <span className="text-[11px] font-black">月</span>
              <select value={`${wYear}-${wMonth}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setWYear(y); setWMonth(m);
                }}
                className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black bg-white">
                {Array.from({ length: 12 }).map((_, i) => {
                  // 今月から12か月ぶんを並べる。年をまたいでも迷わないように年も持つ。
                  const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                  const y = d.getFullYear(); const m = d.getMonth() + 1;
                  return <option key={i} value={`${y}-${m}`}>{y !== now.getFullYear() ? `${y}年 ` : ''}{m}月</option>;
                })}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-black">上旬 / 下旬</span>
              <select value={wHalf}
                onChange={(e) => setWHalf(e.target.value as 'early' | 'late')}
                className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black bg-white">
                <option value="early">上旬</option>
                <option value="late">下旬</option>
              </select>
            </label>
          </div>

          <div className="mt-2">
            <span className="text-[11px] font-black">平日 / 土日</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([['weekend', '土日'], ['weekday', '平日'], ['any', 'どちらでも']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setWDays(v)}
                  className={'py-2.5 rounded-xl text-[13px] font-black border-2 disabled:opacity-50 '
                    + (wDays === v ? 'bg-orange text-white border-orange' : 'bg-white text-sub border-border')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block mt-3">
          <span className="text-[12px] font-black">締め切り（何日で静かに閉じるか）</span>
          <input inputMode="numeric" value={expireDays}
            onChange={(e) => setExpireDays(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))}
            className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[14px] font-black" />
        </label>
        <button onClick={create} disabled={busy}
          className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-orange text-white disabled:opacity-50">
          {actives.length ? `この内容でもう1本立てる（いま${actives.length}本）` : 'この内容で立てる'}
        </button>
      </div>

      {/* 全体で1つだけ持つもの。
          声かけの文面は枠ごとに持つようにしたので、ここからは外した
          （2か所に同じ入力欄があると、どちらが効くのか分からなくなる）。 */}
      {s && (
        <div className="bg-card rounded-xl shadow-card p-4 mb-3">
          <div className="text-[13px] font-black mb-1">人がそろった瞬間にチャットへ流す文</div>
          <div className="text-[11px] font-bold text-sub mb-2 leading-relaxed">
            これは<b className="text-text">全部の枠で共通</b>です。枠ごとの声かけは、上の「枠を立てる」の中にあります。
          </div>
          <Area label="" v={s.filledMessage} on={(v) => setS({ ...s, filledMessage: v })} rows={6} />
          <button onClick={saveSettings} disabled={busy}
            className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-green text-white disabled:opacity-50">保存する</button>
        </div>
      )}

      {/* 履歴 */}
      <div className="bg-card rounded-xl shadow-card p-4">
        <div className="text-[13px] font-black mb-2">これまでの枠（{threads.length}）</div>
        {threads.filter((t) => t.id !== active?.id).map((t) => (
          <a key={t.id} href={appRoundUrl(t.id)} className="block border-b border-hair py-2.5 last:border-0">
            <div className="text-[13px] font-black">{t.title}</div>
            <div className="text-[11px] font-bold text-sub mt-0.5">
              {fmt(t.createdAt)} ・ {STAGE_LABEL[t.official.stage] || t.official.stage} ・ {t.taken}/{t.total}人
            </div>
          </a>
        ))}
        {threads.length === 0 && <div className="text-[12px] text-muted font-bold">まだありません</div>}
      </div>
      <div className="h-8" />
    </div>
  );
}

// 応答が JSON とは限らない（middleware の 404 など）。素の parse 例外を
// そのまま画面に出すと「The string did not match the expected pattern.」の
// ような、原因の分からない文言になる。
async function asJson(r: Response): Promise<any> {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${r.status} ${text.slice(0, 80) || '(空の応答)'}`);
  }
}

function Text({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block mt-2">
      <span className="text-[12px] font-black">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)}
        className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[13.5px] font-black" />
    </label>
  );
}

function Area({ label, v, on, rows }: { label: string; v: string; on: (v: string) => void; rows: number }) {
  return (
    <label className="block mt-2">
      {label && <span className="text-[12px] font-black">{label}</span>}
      <textarea value={v} rows={rows} onChange={(e) => on(e.target.value)}
        className="w-full mt-1 border-2 border-border rounded-xl px-3 py-2.5 text-[13px] font-bold leading-relaxed" />
    </label>
  );
}

/**
 * 走っている枠の開催時期を、その場で直す小さな欄。
 *
 * 立てるときのフォームとは別に要る。この項目より前に立てた枠（＝いま動いているもの）は
 * 時期を持っていないので、後から入れられないと会員には出ないままになる。
 */
function WhenEditor({ t, busy, onSave }: {
  t: Thread; busy: boolean;
  onSave: (t: Thread, w: { year: number; month: number; half: 'early' | 'late'; days: 'weekday' | 'weekend' | 'any' }) => void;
}) {
  const now = new Date();
  const w = t.official.when;
  const [year, setYear] = useState(w?.year || now.getFullYear());
  const [month, setMonth] = useState(w?.month || now.getMonth() + 1);
  const [half, setHalf] = useState<'early' | 'late'>(w?.half || 'late');
  const [days, setDays] = useState<'weekday' | 'weekend' | 'any'>(w?.days || 'weekend');

  const changed = !w || w.year !== year || w.month !== month || w.half !== half || w.days !== days;

  return (
    <div className="mt-2.5 bg-white border-2 border-border rounded-xl p-2.5">
      <div className="text-[11.5px] font-black">
        📅 開催時期{!w && <span className="text-red ml-1">（未設定・会員には出ていません）</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <select value={`${year}-${month}`}
          onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setYear(y); setMonth(m); }}
          className="border-2 border-border rounded-lg px-2 py-2 text-[13px] font-black bg-white">
          {Array.from({ length: 12 }).map((_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const y = d.getFullYear(); const m = d.getMonth() + 1;
            return <option key={i} value={`${y}-${m}`}>{y !== now.getFullYear() ? `${y}年 ` : ''}{m}月</option>;
          })}
        </select>
        <select value={half} onChange={(e) => setHalf(e.target.value as 'early' | 'late')}
          className="border-2 border-border rounded-lg px-2 py-2 text-[13px] font-black bg-white">
          <option value="early">上旬</option>
          <option value="late">下旬</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {([['weekend', '土日'], ['weekday', '平日'], ['any', 'どちらでも']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setDays(v)}
            className={'py-2 rounded-lg text-[12px] font-black border-2 '
              + (days === v ? 'bg-orange text-white border-orange' : 'bg-white text-sub border-border')}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onSave(t, { year, month, half, days })} disabled={busy || !changed}
        className="w-full mt-2 py-2 rounded-lg text-[12px] font-black bg-green text-white disabled:opacity-40">
        {changed ? 'この時期にする' : '保存済み'}
      </button>
    </div>
  );
}
