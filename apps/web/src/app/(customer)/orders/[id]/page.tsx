'use client';

/**
 * Phase 14.5 — Order detail router.
 *
 * Mobile: sticky glass header + container-mobile detail.
 * Desktop: Gmail-style split-pane with the list on the left and the
 *          full detail on the right (matches `/orders` desktop chrome).
 */

import { useIsDesktop } from '@/lib/use-responsive';
import { MobileOrderDetail } from './_mobile';
import { DesktopOrderDetail } from './_desktop';

export default function OrderDetailPage(): JSX.Element {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopOrderDetail /> : <MobileOrderDetail />;
}
