'use client';

import { Suspense, useEffect } from 'react';
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
 * the OTA bundle. The Next.js 14 prerender pipeline requires that any
 * client hook reading the URL (e.g. `useSearchParams()`) live below a
 * `<Suspense>` boundary; otherwise CSR bailout aborts static export.
 */
function VideosRedirector(): null {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const v = search?.get('v');
    router.replace(v ? `/feed?v=${encodeURIComponent(v)}` : '/feed');
  }, [router, search]);

  return null;
}

export default function LegacyVideosRedirect(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <VideosRedirector />
    </Suspense>
  );
}
