'use client';

/**
 * Phase 14.1 — Admin Desktop Shell
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  NP Admin               (search later)        admin ▼      │  top: 56 px
 *   ├──────────┬─────────────────────────────────────────────────┤
 *   │ ภาพรวม   │                                                 │
 *   │  • Dash  │                                                 │
 *   │          │                                                 │
 *   │ ความเสี่ยง │                                                 │
 *   │  • ร้าน   │            { page content full width }          │  scroll area
 *   │  • Orders│                                                 │
 *   │  ...     │                                                 │
 *   └──────────┴─────────────────────────────────────────────────┘
 *
 * Behavioural notes
 *  - Sidebar = 240 px fixed, no collapse (saving that for v2 if power
 *    users complain). Top bar = 56 px, sticky to viewport.
 *  - Active item: rose-tinted background + left-edge accent stripe
 *    + bold text; group headings stay pale neutral.
 *  - Logged-in admin's email is shown bottom-left of the sidebar with
 *    a "ออกจากระบบ" action — saves a trip to the customer profile to
 *    sign out of an admin session.
 *  - "Open as customer" returns to `/feed` — preserves SSO session so
 *    they don't have to log back in.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/cn';
import { ChevronRightIcon, LogoutIcon } from '@/components/icons';
import { ADMIN_NAV, isAdminRouteActive } from './admin-nav-config';

export function AdminDesktopShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  return (
    <div className="grid min-h-dvh grid-cols-[240px_1fr] bg-ink-50">
      {/* ============== Sidebar ============== */}
      <aside className="sticky top-0 flex h-dvh flex-col border-r border-ink-200 bg-white">
        <div className="border-b border-ink-100 px-5 py-3.5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Admin
            </span>
            <span className="text-sm font-bold text-ink-900">NP Console</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {ADMIN_NAV.map((group) => (
            <div key={group.id} className="mb-4">
              <p className="px-5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                {group.heading}
              </p>
              <ul>
                {group.items.map((item) => {
                  const active = isAdminRouteActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'relative flex items-center justify-between gap-2 px-5 py-2 text-sm font-medium transition',
                          active
                            ? 'bg-rose-50 text-rose-700'
                            : 'text-ink-700 hover:bg-ink-50',
                        )}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded-r-full bg-rose-500"
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          {user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                  {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-900">
                    {user.name || 'Admin'}
                  </p>
                  <p className="truncate text-[10px] text-ink-500">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => clear()}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
              >
                <LogoutIcon className="h-3.5 w-3.5" /> ออกจากระบบ
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* ============== Main column ============== */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-ink-200 bg-white px-6">
          <Breadcrumbs pathname={pathname} />
          <Link
            href="/feed"
            className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-200"
          >
            ดูในมุมลูกค้า <ChevronRightIcon className="h-3 w-3" />
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/**
 * Minimal breadcrumbs derived from the active nav item label. Falls back
 * to "Admin" if the route isn't in the nav config (e.g. a future admin
 * detail page).
 */
function Breadcrumbs({ pathname }: { pathname: string | null }): JSX.Element {
  const matched = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.heading })))
    .filter((i) => isAdminRouteActive(pathname, i.href))
    // pick the longest match so '/admin' doesn't beat '/admin/risk/orders'
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <p className="flex items-center gap-1.5 text-xs">
      <span className="text-ink-400">Admin</span>
      {matched && (
        <>
          <ChevronRightIcon className="h-3 w-3 text-ink-300" />
          <span className="text-ink-400">{matched.group}</span>
          <ChevronRightIcon className="h-3 w-3 text-ink-300" />
          <span className="font-semibold text-ink-900">{matched.label}</span>
        </>
      )}
    </p>
  );
}
