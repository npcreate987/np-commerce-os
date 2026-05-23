'use client';

/**
 * Phase 14.4 — Checkout router.
 *
 * State (form data, queries, totals, submit) lives in `useCheckoutState()`
 * so both layouts share business logic — only the layout/composition is
 * duplicated. Mobile: single column + sticky bottom CTA. Desktop: 2-col
 * with sticky right summary.
 */

import { useIsDesktop } from '@/lib/use-responsive';
import { useTrackOnce } from '@/lib/track-hooks';
import { useCheckoutState } from './_state';
import { MobileCheckout } from './_mobile';
import { DesktopCheckout } from './_desktop';

export default function CheckoutPage(): JSX.Element {
  useTrackOnce('checkout_start', { surface: 'checkout' });
  const isDesktop = useIsDesktop();
  const state = useCheckoutState();
  return isDesktop ? <DesktopCheckout s={state} /> : <MobileCheckout s={state} />;
}
