'use client';

import { useEffect, useState } from 'react';
import { getCurrentPosition } from '@/lib/native';

/**
 * Phase 19.7 — `useUserGeo`
 *
 * One-shot geolocation hook used by the video feed to bias clips to the
 * viewer's location.
 *
 * Behaviour
 * ---------
 * - Tries `sessionStorage` first so we only ever prompt for the
 *   permission once per app session.
 * - On miss: calls the unified `getCurrentPosition()` helper (Capacitor
 *   `@capacitor/geolocation` on native, `navigator.geolocation` on web)
 *   with a 6-second timeout. Permission denied / no GPS / timeout all
 *   resolve to `null` — never a thrown error.
 * - The fetch is fully non-blocking: the caller can render the feed
 *   immediately with `geo === null` and the API request will then
 *   refetch once geo arrives.
 *
 * Returns `undefined` while we're still figuring it out (initial render
 * + cold-start probe), `null` if the user denied / device failed,
 * `{ lat, lng }` on success. This three-state shape lets the feed
 * distinguish "still asking" (don't fire the API yet to avoid double-
 * fetching) from "we know there's no geo" (fire the cold-start API).
 */

export type UserGeo = { lat: number; lng: number } | null;

const CACHE_KEY = 'np_user_geo_v1';

interface CachedGeo {
  lat: number;
  lng: number;
  /** epoch ms — we trust the cache for one app session only. */
  at: number;
}

/**
 * Reads the cached geo. Returns:
 *   - `{lat,lng}` on cache hit (the user has previously granted location)
 *   - `undefined` on cache miss (we should re-probe the platform)
 *
 * Note: we intentionally never persist `null` (deny) — a denied permission
 * could be granted later in the same session via the OS settings, so we
 * always retry on a fresh mount.
 */
function readCache(): UserGeo | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedGeo;
    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lng === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* swallow — corrupt cache, treat as miss */
  }
  return undefined;
}

function writeCache(g: UserGeo): void {
  if (typeof window === 'undefined') return;
  try {
    if (g) {
      window.sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...g, at: Date.now() } satisfies CachedGeo),
      );
    } else {
      window.sessionStorage.removeItem(CACHE_KEY);
    }
  } catch {
    /* private mode, quota, etc. — non-fatal */
  }
}

export function useUserGeo(): UserGeo | undefined {
  // undefined = still resolving; null = no geo available; object = got it
  const [geo, setGeo] = useState<UserGeo | undefined>(() => readCache());

  useEffect(() => {
    // Cached hit on first render — no work to do.
    if (geo !== undefined) return;
    let cancelled = false;
    void (async () => {
      const pos = await getCurrentPosition({ timeoutMs: 6000 });
      if (cancelled) return;
      const next: UserGeo = pos
        ? { lat: pos.latitude, lng: pos.longitude }
        : null;
      writeCache(next);
      setGeo(next);
    })();
    return () => {
      cancelled = true;
    };
    // We *intentionally* only run this once; `geo` is the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return geo;
}
