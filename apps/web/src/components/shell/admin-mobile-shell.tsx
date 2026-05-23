'use client';

/**
 * Phase 14.1 — Admin Mobile Shell
 *
 * Wraps the original pill-tab UI that was inline in `(admin)/layout.tsx`.
 * Keeps the tablet/phone admin experience untouched: small brand bar +
 * horizontally scrolling tabs.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ADMIN_NAV_FLAT, isAdminRouteActive } from './admin-nav-config';

export function AdminMobileShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-ink-50 pb-20">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white">
        <div className="container-mobile flex h-12 items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-brand">
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Admin
            </span>
            NP Console
          </span>
          <Link href="/feed" className="text-xs text-ink-500">
            ออกจาก admin →
          </Link>
        </div>
        <nav className="container-mobile flex gap-2 overflow-x-auto pb-2">
          {ADMIN_NAV_FLAT.map((t) => {
            const active = isAdminRouteActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                  active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
