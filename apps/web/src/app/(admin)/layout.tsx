'use client';

/**
 * Phase 14.1 — Admin route layout (thin router).
 *
 * Decides at runtime between:
 *   • `<AdminMobileShell>` — original pill-tab UI for phones/tablets
 *   • `<AdminDesktopShell>` — sidebar + topbar for the support team's daily
 *     desktop work
 *
 * Auth gate (same as before) runs first. Hydration-safe via
 * `_hasHydrated` so a logged-in admin doesn't get bounced to /login
 * on first paint.
 */

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useIsDesktop } from '@/lib/use-responsive';
import { AdminDesktopShell } from '@/components/shell/admin-desktop-shell';
import { AdminMobileShell } from '@/components/shell/admin-mobile-shell';

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element | null {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!hasHydrated) return;
    if (token === null) router.replace('/login');
    else if (user && user.role !== 'ADMIN') router.replace('/feed');
  }, [hasHydrated, token, user, router]);

  if (!hasHydrated) return null;
  if (!token || (user && user.role !== 'ADMIN')) return null;

  return isDesktop ? (
    <AdminDesktopShell>{children}</AdminDesktopShell>
  ) : (
    <AdminMobileShell>{children}</AdminMobileShell>
  );
}
