'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：📊 計測ハブ（2026-10-12）
// 数字を見る場所をここに集める。
//   ① 全体の数字（/api/admin/kpi）……今週ラウンドした人・募集数・満員率・リピート率・活性化
//   ② ポップアップ …… 2026-11-01 に専用の画面（/admin/popups：一覧・オン／オフ・反応・記録の検索）へ移した。ここは入口だけ
//   ③ 募集のイチオシの効果（/api/admin/promo-popup）
//   ④ ほかの計測へ（利用状況・LP・LINE配信・再会・操作ログ）
export default function AdminInsightsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type Kpi = any;
type Promo = { id: string; approved: boolean; showAt: number; until?: number; headline?: string; round: { title: string; date: string; status: string } | null; stats: { seen: number; go: number; joined: number } };

const fmtAt = (ms: number) => (ms ? new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);

  useEffect(() => {
    const t = search?.get('token') || (typeof window !== 'undefined' ? localStorage.getItem('gb_admin_token') || '' : '');
    if (t) setToken(t);
  }, [search]);

  useEffect(() => {
    if (!token) return;
    const q = `token=${encodeURIComponent(token)}`;
    fetch(`/api/admin/kpi?${q}`, { cache: 'no-store' }).then((r) => r.json()).then(setKpi).catch(() => {});
    fetch(`/api/admin/promo-popup?${q}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => setPromos(j.promos || [])).catch(() => {});
  }, [token]);

  const qs = token ? `?token=${encodeURIComponent(token)}` : '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <Link href={`/admin${qs}`} className="text-sm text-blue font-bold">← 管理トップ</Link>
      <h1 className="text-2xl font-black mt-2">📊 計測ハブ</h1>

      {/* ① 全体の数字 */}
      <SectionTitle emoji="🌟" title="全体の数字" sub="ラウンドが回っているか（今週／先週）" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="今週ラウンドした人" value={kpi?.northStar?.thisWeek} sub={kpi ? `先週 ${kpi.northStar?.lastWeek ?? '—'}人` : ''} accent />
        <Kpi label="今週の新しい募集" value={kpi?.supply?.roundsThisWeek} sub={kpi ? `先週 ${kpi.supply?.roundsLastWeek ?? '—'}件` : ''} />
        <Kpi label="今週の満員率" value={kpi?.matching?.fillRateThisWeek != null ? `${kpi.matching.fillRateThisWeek}%` : undefined} sub={kpi ? `全期間 ${kpi.matching?.fillRateAll ?? '—'}%` : ''} />
        <Kpi label="リピート率" value={kpi?.retention?.repeatRate != null ? `${kpi.retention.repeatRate}%` : undefined} sub={kpi ? `${kpi.retention?.repeat ?? 0}/${kpi.retention?.everPlayed ?? 0}人が2回以上` : ''} />
      </div>

      {/* ② ポップアップの反応は、2026-11-01 に「🪟 ポップアップ」へ移した（オン・オフ・記録の検索と一緒に見るため） */}
      <SectionTitle emoji="🪟" title="ポップアップ" sub="反応（成果率・押したもの・誰が）は、オン・オフや記録の検索と一緒に専用の画面へ移しました" />
      <Link href={`/admin/popups${qs}`} className="block bg-card rounded-card shadow-card border-2 border-border p-3.5">
        <div className="text-[14px] font-black">🪟 ポップアップの管理を開く ›</div>
        <div className="text-[11px] text-sub mt-0.5">全ポップアップの一覧とオン・オフ / 反応（統計） / 記録をさがす</div>
      </Link>

      {/* ③ 募集のイチオシ */}
      <SectionTitle emoji="🔥" title="募集のイチオシの効果" sub="表示した人 → 「参加してみる」を押した人 → その後に申請・参加した人" />
      {promos.length === 0 ? <div className="text-[12px] text-muted">まだありません。<Link href={`/admin/promo${qs}`} className="text-blue font-bold">イチオシを作る →</Link></div> : (
        <div className="flex flex-col gap-1.5">
          {promos.slice(0, 6).map((p) => (
            <div key={p.id} className="bg-card rounded-xl border-2 border-border px-3 py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold truncate">{p.round ? `${p.round.date.slice(5).replace('-', '/')} ${p.round.title}` : p.id}</div>
                <div className="text-[10.5px] text-muted">{fmtAt(p.showAt)}〜 {p.approved ? '' : '（停止中）'}</div>
              </div>
              <Funnel a={p.stats.seen} b={p.stats.go} c={p.stats.joined} />
            </div>
          ))}
          <Link href={`/admin/promo${qs}`} className="text-[12px] text-blue font-bold">→ イチオシの管理・作成</Link>
        </div>
      )}

      {/* ④ ほかの計測 */}
      <SectionTitle emoji="🧭" title="ほかの計測" sub="くわしく見るときはこちら" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-10">
        {[
          { href: `/admin/activity${qs}`, emoji: '📈', title: '利用状況', desc: 'よく開かれる画面・アクティブ会員・登録の推移' },
          { href: `/admin/analytics${qs}`, emoji: '🕒', title: 'アクセス分析', desc: '時間帯・カレンダー' },
          { href: `/admin/lp-funnel${qs}`, emoji: '🧭', title: 'LP・診断の流入', desc: '入口別のファネル・離脱' },
          { href: `/admin/line-stats${qs}`, emoji: '📨', title: 'LINE配信の通数', desc: '種別ごと・月別' },
          { href: `/admin/rematch${qs}`, emoji: '🔁', title: '再会のファネル', desc: '通知→候補入力→決定' },
          { href: `/admin/audit${qs}`, emoji: '📒', title: '操作ログ', desc: '誰が・誰に・何をしたか' },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="bg-card rounded-card shadow-card border-2 border-border p-3">
            <div className="text-[18px]">{c.emoji}</div>
            <div className="text-[13px] font-black mt-0.5">{c.title}</div>
            <div className="text-[10.5px] text-sub leading-snug mt-0.5">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}



function SectionTitle({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="mt-7 mb-2.5">
      <div className="text-[17px] font-black">{emoji} {title}</div>
      {sub && <div className="text-[11px] text-sub mt-0.5">{sub}</div>}
    </div>
  );
}
function Kpi({ label, value, sub, accent }: { label: string; value?: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={'rounded-card border-2 border-border shadow-card p-3 ' + (accent ? 'bg-green-light' : 'bg-card')}>
      <div className="text-[10.5px] font-bold text-sub">{label}</div>
      <div className="text-[22px] font-black leading-tight mt-0.5">{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
function Funnel({ a, b, c }: { a: number; b: number; c: number }) {
  const r = (x: number) => (a ? `${Math.round((x / a) * 100)}%` : '—');
  return (
    <div className="flex items-center gap-1 text-[11px] font-black flex-none">
      <span className="px-2 py-1 rounded-lg bg-bg border border-border">表示 {a}</span>→
      <span className="px-2 py-1 rounded-lg bg-orange-light border border-orange text-orange">押した {b}<span className="font-bold text-[9.5px] ml-0.5">{r(b)}</span></span>→
      <span className="px-2 py-1 rounded-lg bg-green-light border border-green text-green">申請 {c}<span className="font-bold text-[9.5px] ml-0.5">{r(c)}</span></span>
    </div>
  );
}
