'use client';

/**
 * Phase 14.3 — Product Detail Page router.
 *
 * Switches between the original phone-sized PDP (`MobilePDP`) and a
 * Shopify-style 2-col desktop (`DesktopPDP`) based on `useIsDesktop()`.
 * Each variant owns its own data fetching; React Query dedupes by
 * `['product', id]` key so swapping form factor never re-hits the API.
 */

import { useIsDesktop } from '@/lib/use-responsive';
import { MobilePDP } from './_mobile';
import { DesktopPDP } from './_desktop';

export default function ProductDetailPage(): JSX.Element {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopPDP /> : <MobilePDP />;
}
