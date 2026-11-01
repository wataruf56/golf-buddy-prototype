'use client';

import { Suspense } from 'react';
import { ConfirmHost } from '@/components/ConfirmDialog';
import { AdminMenu } from '@/components/admin/AdminMenu';

// Admin layout — pass-through.
//
// Auth has been intentionally removed for now. The admin host
// (admin.goltomo.com) is unguessable and the legacy ADMIN_LOG_TOKEN check on
// /api/admin/* still applies, but the client auto-fetches that token from
// /api/admin/_init so the UI never shows a token/password prompt. To
// re-enable a gate later, restore the cookie check in this file.
//
// 右下の「☰ メニュー」（components/admin/AdminMenu・2026-11-01）はここで全画面に出す。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}><AdminMenu /></Suspense>
      <ConfirmHost />
    </>
  );
}
