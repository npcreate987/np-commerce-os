'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CustomerBottomNav } from '@/components/bottom-nav';
import { ChatWidget } from '@/components/chat-widget';
import { CustomerTopBar } from '@/components/shell/customer-top-bar';
import { CustomerMobileHeader } from '@/components/shell/customer-mobile-header';
import { CreateFAB } from '@/components/shell/create-fab';
import { cn } from '@/lib/cn';

/**
 * Customer shell — wraps customer routes with responsive chrome.
 *
 * Layout strategy
 * ---------------
 * - **Mobile (<lg, ≤1023 px)** — sticky glass header + bottom tab bar + single-col content
 * - **Desktop (≥lg, 1024 px+)** — sticky top bar with horizontal nav + centered content (max-w-app 1280 px)
 *
 * Immersive mode (Phase 12 — TikTok feed)
 * ---------------------------------------
 * Routes matched by `IMMERSIVE_ROUTES` get a stripped-down chrome:
 *   - Mobile header is hidden (the reel paints its own overlay top)
 *   - Bottom nav switches to translucent dark glass and floats over content
 *   - Page wrapper drops the bottom padding (page is `100dvh`)
 *   - Chat widget is hidden (the floating bubble would obscure the video CTA)
 *
 * Pages should NOT add their own top header — use the shared shell.
 * Pages can still add page-level sub-headers (section heading, filter bar, etc.).
 */
const IMMERSIVE_ROUTES = new Set<string>(['/feed']);

export function CustomerShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const immersive = pathname ? IMMERSIVE_ROUTES.has(pathname) : false;

  return (
    <div
      className={cn(
        'bg-surface text-surface-strong min-h-dvh',
        !immersive && 'pb-24 lg:pb-0',
      )}
    >
      <CustomerTopBar />
      {!immersive && <CustomerMobileHeader />}
      {children}
      <CustomerBottomNav variant={immersive ? 'overlay' : 'default'} />
      {/* The "create clip" FAB only makes sense on the immersive reel. Other
          customer pages (cart, orders, etc.) keep the chat widget instead. */}
      {immersive ? <CreateFAB /> : <ChatWidget />}
    </div>
  );
}
