'use client';

import { useEffect, useRef } from 'react';
import { tracker, type TrackFields, type TrackKind } from './track';

/**
 * Phase 10.1 — React tracking hooks.
 *
 * `useTrackOnce`        → fires a single event when the component mounts.
 * `useDwellTracker`     → starts a stopwatch on mount, emits `product_dwell`
 *                         (or any chosen kind) when the user has spent enough
 *                         contiguous *visible* time on the entity.
 * `useScrollDepth`      → emits a one-shot event when the user has scrolled
 *                         past a given fraction of the document.
 */

interface DwellArgs extends TrackFields {
  kind: TrackKind;
  /** Minimum contiguous visible time (ms) before the event fires. */
  thresholdMs?: number;
}

/** Fire once per mount. */
export function useTrackOnce(kind: TrackKind, fields: TrackFields = {}): void {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    tracker.track(kind, fields);
    // We deliberately do NOT include `fields` in the dep array — components
    // sometimes pass freshly-built object literals; we want one fire only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
}

/**
 * Track contiguous *visible* time on a page (PDP, video, etc.) and fire a
 * single dwell event when the threshold is crossed. Tabs going to the
 * background pause the timer; coming back resumes it.
 */
export function useDwellTracker({
  kind,
  entityType,
  entityId,
  surface,
  meta,
  thresholdMs = 30_000,
}: DwellArgs): void {
  const startRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (typeof document === 'undefined') return;

    const start = (): void => {
      if (startRef.current == null) startRef.current = Date.now();
    };
    const stop = (): void => {
      if (startRef.current != null) {
        accumulatedRef.current += Date.now() - startRef.current;
        startRef.current = null;
      }
      maybeFire();
    };
    const maybeFire = (): void => {
      if (firedRef.current) return;
      const total =
        accumulatedRef.current +
        (startRef.current != null ? Date.now() - startRef.current : 0);
      if (total >= thresholdMs) {
        firedRef.current = true;
        tracker.track(kind, {
          entityType,
          entityId,
          surface,
          dwellMs: total,
          meta,
        });
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    // Periodic check while still visible — fire on the threshold even if user
    // doesn't switch tabs (otherwise the event would only fire on unmount).
    const interval = setInterval(maybeFire, 1_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      stop();
    };
  }, [kind, entityType, entityId, surface, meta, thresholdMs]);
}

/**
 * Fire a one-shot scroll-depth event when the document is scrolled past
 * `threshold` (0..1 fraction). Default: 0.75.
 */
export function useScrollDepth({
  entityType,
  entityId,
  surface,
  meta,
  threshold = 0.75,
  kind = 'product_scroll',
}: TrackFields & { threshold?: number; kind?: TrackKind }): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (typeof window === 'undefined') return;

    const onScroll = (): void => {
      if (firedRef.current) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const totalH = doc.scrollHeight;
      if (totalH <= 0) return;
      const pct = scrolled / totalH;
      if (pct >= threshold) {
        firedRef.current = true;
        tracker.track(kind, {
          entityType,
          entityId,
          surface,
          scrollPct: Math.min(100, Math.round(pct * 100)),
          meta,
        });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [kind, entityType, entityId, surface, meta, threshold]);
}
