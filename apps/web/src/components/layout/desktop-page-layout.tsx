'use client';

/**
 * Phase 14 — `<DesktopPageLayout>` + companion primitives.
 *
 * Three reusable shells for desktop-only page bodies. Each is just a
 * grid + container; none of them branches on viewport (they assume the
 * caller has already decided "this is desktop" via `useIsDesktop()`).
 *
 *   <DesktopPageLayout left={<ProfileSidebar />}>
 *     <ProfileTabs />
 *   </DesktopPageLayout>
 *
 *   <DesktopSplitPane list={<OrderList />}>
 *     <OrderDetail id={selectedId} />
 *   </DesktopSplitPane>
 *
 *   <DesktopBuyBoxLayout main={<Gallery />} aside={<BuyBox />} />
 *
 * Container width: `max-w-app` (1280 px) for `DesktopPageLayout` /
 * `DesktopBuyBoxLayout`. `DesktopSplitPane` is `max-w-screen-2xl` (1440 px)
 * since list/detail benefits from more horizontal room.
 */

import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

interface DesktopPageLayoutProps {
  /** Left column (sticky). Typical width: ~280–320 px. */
  left: ReactNode;
  /** Right (main) column. */
  children: ReactNode;
  /** Override left column width via Tailwind grid template (default 280px). */
  leftWidth?: '240' | '280' | '320' | '360';
  /** Optional className on the outer container. */
  className?: string;
}

const LEFT_GRID: Record<NonNullable<DesktopPageLayoutProps['leftWidth']>, string> = {
  '240': 'lg:grid-cols-[240px_1fr]',
  '280': 'lg:grid-cols-[280px_1fr]',
  '320': 'lg:grid-cols-[320px_1fr]',
  '360': 'lg:grid-cols-[360px_1fr]',
};

/**
 * Sidebar-left layout (e.g. /profile desktop, /admin sub-routes).
 * Sidebar is sticky to the top so it stays visible while content scrolls.
 */
export function DesktopPageLayout({
  left,
  children,
  leftWidth = '280',
  className,
}: DesktopPageLayoutProps): JSX.Element {
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-app gap-8 px-6 py-6',
        LEFT_GRID[leftWidth],
        className,
      )}
    >
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        {left}
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

/**
 * Gmail-style split pane (list left, detail right).
 * The list is fixed-width and scrolls independently; the detail panel
 * fills the remaining width and also scrolls independently. Good for
 * /orders, /inbox-like routes.
 */
export function DesktopSplitPane({
  list,
  listWidth = '380',
  children,
  className,
}: {
  list: ReactNode;
  listWidth?: '320' | '380' | '440';
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const grid =
    listWidth === '320'
      ? 'lg:grid-cols-[320px_1fr]'
      : listWidth === '440'
        ? 'lg:grid-cols-[440px_1fr]'
        : 'lg:grid-cols-[380px_1fr]';
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-screen-2xl gap-0 px-0 lg:h-[calc(100dvh-4rem)]',
        grid,
        className,
      )}
    >
      <section className="border-r bg-white lg:overflow-y-auto">{list}</section>
      <section className="bg-ink-50 lg:overflow-y-auto">{children}</section>
    </div>
  );
}

/**
 * PDP-style layout: large media on the left, sticky buy box on the right.
 * Below `lg` it collapses to a single column (caller is responsible for
 * the mobile fallback — usually they render `<MobilePDP />` instead).
 */
export function DesktopBuyBoxLayout({
  main,
  aside,
  asideWidth = '380',
  className,
}: {
  main: ReactNode;
  aside: ReactNode;
  asideWidth?: '320' | '380' | '420';
  className?: string;
}): JSX.Element {
  const grid =
    asideWidth === '320'
      ? 'lg:grid-cols-[1fr_320px]'
      : asideWidth === '420'
        ? 'lg:grid-cols-[1fr_420px]'
        : 'lg:grid-cols-[1fr_380px]';
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-app gap-8 px-6 py-6',
        grid,
        className,
      )}
    >
      <main className="min-w-0">{main}</main>
      <aside className="lg:sticky lg:top-20 lg:self-start">{aside}</aside>
    </div>
  );
}
