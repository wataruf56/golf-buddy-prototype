'use client';

import { ConfirmHost } from '@/components/ConfirmDialog';

// Admin layout — pass-through.
//
// Auth has been intentionally removed for now. The admin host
// (admin.goltomo.com) is unguessable and the legacy ADMIN_LOG_TOKEN check on
// /api/admin/* still applies, but the client auto-fetches that token from
// /api/admin/_init so the UI never shows a token/password prompt. To
// re-enable a gate later, restore the cookie check in this file.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ConfirmHost />
    </>
  );
}
