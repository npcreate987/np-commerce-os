import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

/**
 * Legacy `/feed/videos` route.
 *
 * Phase 12 promoted the TikTok-style reel to `/feed`, so this route now just
 * forwards any inbound link (deep-shared clips, old bookmarks, push
 * notifications) to the new home, preserving the `?v=<id>` deep-link param.
 */
export const metadata: Metadata = {
  title: 'NP — Feed',
};

interface PageProps {
  searchParams?: { v?: string | string[] };
}

export default function LegacyVideosRedirect({ searchParams }: PageProps): never {
  const raw = searchParams?.v;
  const v = Array.isArray(raw) ? raw[0] : raw;
  redirect(v ? `/feed?v=${encodeURIComponent(v)}` : '/feed');
}
