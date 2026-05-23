'use client';

/**
 * Phase 14.4 — Cart router.
 */

import { useIsDesktop } from '@/lib/use-responsive';
import { useTrackOnce } from '@/lib/track-hooks';
import { MobileCart } from './_mobile';
import { DesktopCart } from './_desktop';

export default function CartPage(): JSX.Element {
  useTrackOnce('page_view', { surface: 'cart' });
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopCart /> : <MobileCart />;
}
