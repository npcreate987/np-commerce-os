'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { VideoFeed } from '@/components/video/video-feed';
import { useTrackOnce } from '@/lib/track-hooks';
import { PlayIcon } from '@/components/icons';

/**
 * `/feed` — TikTok-style short video reel (Phase 12).
 *
 * The old commerce home (product grid + bento + rails) moved to `/feed/shop`.
 *
 * Layout
 * ------
 * The Customer shell detects this exact route via `IMMERSIVE_ROUTES` and:
 *   - hides the mobile sticky header
 *   - switches the bottom nav to translucent overlay
 *   - hides the chat-widget bubble (would obscure the product CTA)
 *
 * The reel itself is rendered by the `<VideoFeed />` primitive, which is
 * reused by deep-link variants (creator profile reel, hashtag reel, PDP reel).
 */
export default function FeedReelPage(): JSX.Element {
  useTrackOnce('page_view', { surface: 'feed' });
  return (
    <Suspense fallback={<FeedFallback />}>
      <FeedReel />
    </Suspense>
  );
}

function FeedReel(): JSX.Element {
  const searchParams = useSearchParams();
  const initialId = searchParams?.get('v') ?? null;
  return <VideoFeed surface="feed" mode="immersive" initialId={initialId} />;
}

function FeedFallback(): JSX.Element {
  return (
    <div className="fixed inset-0 z-immersive grid place-items-center bg-black text-white">
      <PlayIcon className="h-10 w-10 animate-pulse opacity-50" />
    </div>
  );
}
