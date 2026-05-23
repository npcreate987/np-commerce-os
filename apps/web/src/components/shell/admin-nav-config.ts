/**
 * Phase 14.1 — single source of truth for admin navigation.
 *
 * Both `AdminMobileShell` (pill tabs at the top) and `AdminDesktopShell`
 * (grouped vertical sidebar) read from this file so adding a new admin
 * route is a 1-line change.
 *
 * Group order matters for sidebar rendering. Each group's heading is
 * hidden on mobile (it flattens to a single horizontal tab strip).
 */

export interface AdminNavItem {
  href: string;
  label: string;
  /** Optional inline badge text (e.g. "new"). */
  badge?: string;
}

export interface AdminNavGroup {
  id: string;
  heading: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: 'overview',
    heading: 'ภาพรวม',
    items: [{ href: '/admin', label: 'แดชบอร์ด' }],
  },
  {
    id: 'risk',
    heading: 'ความเสี่ยง',
    items: [
      { href: '/admin/risk/shops',     label: 'ร้านเสี่ยง'      },
      { href: '/admin/risk/orders',    label: 'ออเดอร์ผิดปกติ'  },
      { href: '/admin/risk/logistics', label: 'ขนส่ง'           },
    ],
  },
  {
    id: 'moderation',
    heading: 'การตรวจสอบเนื้อหา',
    items: [
      { href: '/admin/reviews', label: 'รีวิว' },
      { href: '/admin/videos',  label: 'วิดีโอ', badge: 'NEW' },
      { href: '/admin/chat',    label: 'แชทลูกค้า' },
    ],
  },
  {
    id: 'insights',
    heading: 'อินไซต์',
    items: [
      { href: '/admin/search', label: 'Search' },
      { href: '/admin/events', label: 'Events' },
      { href: '/admin/ai-ops', label: 'AI Ops' },
    ],
  },
];

/** Flattened list — used by `AdminMobileShell` which has no headings. */
export const ADMIN_NAV_FLAT: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

export function isAdminRouteActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Exact-match for the dashboard so '/admin/risk/...' doesn't also light it up.
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
