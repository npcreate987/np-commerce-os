'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Legacy `/feed/videos` route.
 *
 * Phase 12 promoted the TikTok-style reel to `/feed`, so this route now
 * just forwards any inbound link (deep-shared clips, old bookmarks, push
 * notifications) to the new home, preserving the `?v=<id>` deep-link
 * param.
 *
 * Phase 18 — converted from server-side `redirect()` to client-side
 * `router.replace()` so that the page can be statically exported for
 * the OTA bundle. Server-side `searchParams` + `redirect()` cannot
 * survive `output: 'export'`.
 */
export default function LegacyVideosRedirect(): null {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const v = search?.get('v');
    router.replace(v ? `/feed?v=${encodeURIComponent(v)}` : '/feed');
  }, [router, search]);

  return null;
}
