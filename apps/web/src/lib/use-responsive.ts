'use client';

/**
 * Phase 14 — Responsive form-factor hooks.
 *
 * Mobile-first SSR: every component starts as "mobile" on the server and
 * during the very first client render. After mount we read `matchMedia` and
 * flip to the real value, then subscribe for live updates (window resize,
 * device rotation, dragging the browser window across a multi-monitor edge).
 *
 * Why not `'lg' in window` or a media-query inside `useEffect`? — `useSyncExternalStore`
 * gives us a stable, React-18-correct subscription with built-in SSR snapshot
 * support, no re-render storms, and a clean unsubscribe path.
 *
 * Breakpoint policy:
 *   - DESKTOP threshold = Tailwind `lg` (`>= 1024px`)
 *   - We deliberately treat tablets as "mobile" because TikTok-style touch
 *     UX still works there; the Desktop variants assume mouse + hover.
 */

import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia(DESKTOP_QUERY);
  // Safari < 14 still needs addListener; modern browsers expose addEventListener.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }
  mql.addListener(callback);
  return () => mql.removeListener(callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false; // mobile-first SSR
}

/**
 * Returns `true` when the viewport is >= 1024px wide AFTER hydration has
 * completed. Always returns `false` on first SSR/CSR render so the markup
 * is hydration-stable.
 *
 * Use this in router pages to swap entire component trees:
 *
 *   const isDesktop = useIsDesktop();
 *   return isDesktop ? <DesktopProfile /> : <MobileProfile />;
 *
 * Both branches still mount the same `useQuery(...)` hooks; React Query
 * dedupes the network request, so swapping is "free" data-wise.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
