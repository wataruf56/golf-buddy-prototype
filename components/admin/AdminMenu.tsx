'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Portal } from '@/components/Portal';
import { filterAdminMenu } from '@/lib/adminMenu';

// 管理画面のどこからでも開けるメニュー（2026-11-01・本人要望「いろんな画面に遷移していて分かりにくい」）。
// 右下の「☰ メニュー」→ 6つのグループの全画面が並ぶ。いったん管理トップに戻らなくても、別の画面へ直接行ける。
// 中身は lib/adminMenu（管理トップと同じ）。管理トップとログイン画面には出さない。
export function AdminMenu() {
  const pathname = usePathname() || '';
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    const t = search?.get('token') || (() => { try { return localStorage.getItem('gb_admin_token') || ''; } catch { return ''; } })();
    setToken(t);
  }, [search]);
  useEffect(() => { setOpen(false); setQ(''); }, [pathname]);
  if (pathname === '/admin' || pathname.startsWith('/admin/login')) return null;

  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const groups = filterAdminMenu(q);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="管理画面のメニュー"
        className="fixed right-4 z-[200] px-4 py-2.5 rounded-full bg-text text-white text-[13px] font-black shadow-card"
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>☰ メニュー</button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[250] bg-black/45 flex justify-end" onClick={() => setOpen(false)}>
            <div className="h-full w-full max-w-md bg-bg overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <Link href={`/admin${qs}`} className="text-[15px] font-black">⚙️ 管理トップ</Link>
                <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="ml-auto w-9 h-9 rounded-full bg-card border-2 border-border text-[18px] leading-none">×</button>
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="画面をさがす（例：ポップアップ、DM、通報）"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-border bg-card text-[13px] mb-3" />
              {groups.length === 0 && <div className="text-[12px] text-muted text-center py-6">見つかりませんでした</div>}
              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <div key={g.key}>
                    <div className="text-[12px] font-black text-sub mb-1.5">{g.emoji} {g.name}</div>
                    <div className="flex flex-col gap-1">
                      {g.items.map((it) => {
                        const on = pathname === it.path;
                        return (
                          <Link key={it.path} href={`${it.path}${qs}`}
                            className={'flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 ' + (on ? 'bg-green-light border-green' : 'bg-card border-transparent')}>
                            <span className="text-[18px]">{it.emoji}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-black">{it.title}{it.isNew && <span className="ml-1.5 text-[9.5px] px-1.5 py-0.5 rounded-full bg-orange text-white align-middle">NEW</span>}{on && <span className="ml-1.5 text-[10px] text-green">いまここ</span>}</span>
                              <span className="block text-[10.5px] text-sub leading-snug truncate">{it.desc}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
