'use client';

import Link from 'next/link';

// 管理画面のサブタブ。関連する画面を1グループにまとめ、
// 管理トップからは1項目で入って、この帯で行き来する。
//
// グループを増やすときは GROUPS に足すだけ。各画面は
//   <AdminTabs token={token} group="lp" current="/admin/lp" />
// を「‹ 管理」の下に置く。

type Tab = { href: string; label: string };

const GROUPS: Record<string, { title: string; tabs: Tab[] }> = {
  // LPまわり：流入から診断の中身まで
  lp: {
    title: '📊 LPレポート',
    tabs: [
      { href: '/admin/lp-funnel', label: '🧭 流入ファネル' },
      { href: '/admin/lp', label: '⛳ 診断の中身' },
    ],
  },
  // メッセージまわり
  messages: {
    title: '💬 メッセージ',
    tabs: [
      { href: '/admin/dm', label: '💬 DMログ' },
      { href: '/admin/unread', label: '📩 未読ユーザー' },
    ],
  },
  // ラウンド募集まわり
  rounds: {
    title: '🏆 ラウンド募集',
    tabs: [
      { href: '/admin/rounds', label: '🏆 募集の一覧' },
      { href: '/admin/titles', label: '✍️ タイトル定型文' },
    ],
  },
  // 信頼とトラブル対応（評価・通報・ペナルティ・レビュー）
  trust: {
    title: '🛡️ 信頼・トラブル対応',
    tabs: [
      { href: '/admin/ratings', label: '⭐ 評価の状況' },
      { href: '/admin/reports', label: '🚨 通報' },
      { href: '/admin/manner', label: '🙅 ドタキャン' },
      { href: '/admin/reviews', label: '📝 レビュー' },
    ],
  },
};

export function AdminTabs({ token, group, current }: { token: string; group: keyof typeof GROUPS | string; current: string }) {
  const g = GROUPS[group];
  if (!g) return null;
  return (
    <div className="mb-3">
      <div className="text-[10.5px] text-muted font-bold mb-1">{g.title}</div>
      <div className="flex gap-1 bg-card rounded-full p-1 shadow-card overflow-x-auto">
        {g.tabs.map((t) => {
          const on = t.href === current;
          return (
            <Link
              key={t.href}
              href={`${t.href}?token=${encodeURIComponent(token)}`}
              className={
                'flex-1 whitespace-nowrap text-center py-1.5 px-2 rounded-full text-[11px] font-bold transition-colors ' +
                (on ? 'bg-green text-white' : 'text-sub')
              }
            >{t.label}</Link>
          );
        })}
      </div>
    </div>
  );
}
