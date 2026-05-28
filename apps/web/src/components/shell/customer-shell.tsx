'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CustomerBottomNav } from '@/components/bottom-nav';
import { ChatWidget } from '@/components/chat-widget';
import { CustomerTopBar } from '@/components/shell/customer-top-bar';
import { CustomerMobileHeader } from '@/components/shell/customer-mobile-header';
import { CreateFAB } from '@/components/shell/create-fab';
import { NativeBridge } from '@/components/native-bridge';
import { useAuthStore } from '@/stores/auth-store';
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

/**
 * Strip the trailing slash that the Capacitor static export adds
 * (`next.config.mjs` sets `trailingSlash: true` so `/feed` is served
 * as `/feed/index.html`). Without this normalisation the immersive
 * detection was failing on native, which dropped the mobile search
 * header on top of the TikTok-style feed top bar.
 */
function normalisePath(p: string | null | undefined): string {
  if (!p) return '';
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

export function CustomerShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const immersive = IMMERSIVE_ROUTES.has(normalisePath(pathname));
  const token = useAuthStore((s) => s.token);

  return (
    <div
      className={cn(
        'bg-surface text-surface-strong min-h-dvh',
        // Reserve room for the mobile bottom nav (h-bottomnav-m = 48 px +
        // safe-area padding). `pb-28` (112 px) still leaves comfortable
        // breathing room above the nav bar on cart / product / checkout
        // pages even after the rail itself was tightened.
        !immersive && 'pb-28 lg:pb-0',
      )}
    >
      <NativeBridge authToken={token} />
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
