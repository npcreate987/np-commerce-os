'use client';

/**
 * Phase 14.5 — `/orders` router.
 *
 * Mobile: full-width list + Buy Again strip.
 * Desktop: Gmail-style master pane with empty "pick one" right-hand
 *          state until the user navigates to a specific order.
 */

import { useIsDesktop } from '@/lib/use-responsive';
import { MobileOrders } from './_mobile';
import { DesktopOrders } from './_desktop';

export default function OrdersPage(): JSX.Element {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopOrders /> : <MobileOrders />;
}
