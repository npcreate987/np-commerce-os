'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { nativeShare } from '@/lib/native';
import { useAuthStore } from '@/stores/auth-store';
import { tracker } from '@/lib/track';
import { cn } from '@/lib/cn';
import {
  BagIcon,
  BookmarkIcon,
  CommentIcon,
  FlagIcon,
  HeartIcon,
  MusicIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ShareIcon,
  SparklesIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from '@/components/icons';
import { ReportSheet } from '@/components/video/report-sheet';
import type { VideoFeedItem } from '@np/types';

/**
 * Phase 12 — TikTok-style vertical short-video feed primitive.
 *
 * Behaviour
 * ---------
 * - Vertical CSS scroll-snap container, one clip = full viewport (mobile) /
 *   phone-frame (desktop).
 * - IntersectionObserver per `<video>`: when ≥60 % of the slide is visible it
 *   starts playing; otherwise it pauses. Only **one** clip plays at a time.
 * - Globally synced mute state — tapping the speaker toggles ALL videos at
 *   once. Default is `muted` (browser autoplay policy).
 * - Tap on the video toggles play/pause for the active slide.
 * - Like → `api.feed.like` (optimistic), Share → `navigator.share` or
 *   clipboard fallback, Save (bookmark) is local-only for now.
 * - Server view counter (`api.feed.view`) fires when a clip becomes active.
 *   Behavioural events (`video_play`, `video_complete`) go to the firehose.
 * - Infinite scroll: when the user passes the (N-3)-th slide, the next cursor
 *   is fetched and appended seamlessly.
 *
 * Why a single component?
 * -----------------------
 * Both `/feed` and `/feed/videos` (legacy alias) render this. Future variants
 * (creator profile reel, hashtag feed, product PDP reel) can pass a different
 * `fetcher` and `surface`.
 */

export interface VideoFeedProps {
  /** Surface label for analytics. Defaults to `'feed'`. */
  surface?: string;
  /**
   * Visual mode:
   * - `'immersive'` (default) — full-bleed, used at the main `/feed` page.
   * - `'embedded'` — same UX inside a fixed-height parent (e.g. for a modal).
   */
  mode?: 'immersive' | 'embedded';
  /** Optional initial video id to scroll to (deep link `?v=...`). */
  initialId?: string | null;
  /** Custom fetcher; defaults to `api.feed.list`. */
  fetcher?: (cursor: number, limit: number) => Promise<VideoFeedItem[]>;
}

function formatBaht(cents: number | null): string | null {
  if (cents == null) return null;
  return `฿${(cents / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function formatCount(n: number): string {
  if (n < 1_000) return n.toString();
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const PAGE_LIMIT = 8;

export function VideoFeed({
  surface = 'feed',
  mode = 'immersive',
  initialId = null,
  fetcher,
}: VideoFeedProps): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  // Phase 12.2 — id of the video the user is reporting (null when sheet hidden)
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  // ------- Data: infinite paginated list -------------------------------------
  const listFn = fetcher ?? ((cursor: number, limit: number) =>
    api.feed.list(token ?? null, cursor, limit));

  const feedQ = useInfiniteQuery({
    queryKey: ['feed', 'videos', token ? 'auth' : 'anon'],
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) => listFn(pageParam as number, PAGE_LIMIT),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_LIMIT ? allPages.flat().length : undefined,
  });

  const items: VideoFeedItem[] = useMemo(
    () => (feedQ.data?.pages ?? []).flat(),
    [feedQ.data],
  );

  // ------- Player state ------------------------------------------------------
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());

  const scrollerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const slideRefs = useRef<Map<string, HTMLElement>>(new Map());
  const playedSet = useRef<Set<string>>(new Set()); // for one-shot video_play
  const completedSet = useRef<Set<string>>(new Set()); // one-shot video_complete

  // ------- Scroll to initial id (deep link) ----------------------------------
  useEffect(() => {
    if (!initialId || items.length === 0) return;
    const el = slideRefs.current.get(initialId);
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    // run once when the deep-linked clip first becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId, items.length === 0]);

  // ------- IntersectionObserver: play visible, pause others ------------------
  useEffect(() => {
    if (items.length === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.videoId;
          if (!id) continue;
          const vid = videoRefs.current.get(id);
          if (!vid) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            // Active slide
            const idx = items.findIndex((i) => i.id === id);
            if (idx >= 0) setActiveIdx(idx);
            if (!paused) {
              vid.muted = muted;
              const promise = vid.play();
              if (promise && typeof promise.catch === 'function') {
                promise.catch(() => {
                  // Autoplay blocked — keep silent, user will tap
                });
              }
            }
            // First-play firehose event
            if (!playedSet.current.has(id)) {
              playedSet.current.add(id);
              tracker.track('video_play', {
                entityType: 'video',
                entityId: id,
                surface,
              });
              // Server-side score bump (best-effort)
              api.feed.view(id).catch(() => undefined);
            }
          } else {
            if (!vid.paused) vid.pause();
          }
        }
      },
      {
        root: scroller,
        threshold: [0, 0.6, 1],
      },
    );

    for (const el of slideRefs.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [items, muted, paused, surface]);

  // ------- Infinite scroll: fetch next page when near the end ---------------
  useEffect(() => {
    if (!feedQ.hasNextPage || feedQ.isFetchingNextPage) return;
    if (items.length === 0) return;
    if (activeIdx >= items.length - 3) {
      void feedQ.fetchNextPage();
    }
  }, [activeIdx, items.length, feedQ.hasNextPage, feedQ.isFetchingNextPage, feedQ]);

  // ------- Pause all when user toggles global pause -------------------------
  useEffect(() => {
    const active = items[activeIdx];
    if (!active) return;
    const vid = videoRefs.current.get(active.id);
    if (!vid) return;
    if (paused) vid.pause();
    else void vid.play().catch(() => undefined);
  }, [paused, activeIdx, items]);

  // ------- Sync mute across all <video> elements -----------------------------
  useEffect(() => {
    for (const v of videoRefs.current.values()) v.muted = muted;
  }, [muted]);

  // ------- Like (optimistic) -------------------------------------------------
  const likeM = useMutation({
    mutationFn: (id: string) => api.feed.like(token!, id),
    onMutate: async (id: string) => {
      // Optimistic toggle on the cached infinite pages
      await qc.cancelQueries({ queryKey: ['feed', 'videos'] });
      const snapshot = qc.getQueriesData<{ pages: VideoFeedItem[][] }>({
        queryKey: ['feed', 'videos'],
      });
      qc.setQueriesData<{ pages: VideoFeedItem[][] } | undefined>(
        { queryKey: ['feed', 'videos'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((v) =>
                v.id === id
                  ? {
                      ...v,
                      liked: !v.liked,
                      likes: v.liked ? v.likes - 1 : v.likes + 1,
                    }
                  : v,
              ),
            ),
          };
        },
      );
      tracker.track('share', {
        entityType: 'video',
        entityId: id,
        surface,
        meta: { kind: 'like' },
      });
      return { snapshot };
    },
    onError: (_e, _id, ctx) => {
      // Roll back on failure
      ctx?.snapshot.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['feed', 'videos'] });
    },
  });

  const toggleSave = useCallback((id: string) => {
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onTapVideo = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // ------- Render states -----------------------------------------------------
  if (feedQ.isLoading) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-black text-white',
          mode === 'immersive' ? 'fixed inset-0 z-immersive' : 'h-full w-full',
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <PlayIcon className="h-10 w-10 animate-pulse opacity-50" />
          <span className="text-xs font-medium text-white/60">กำลังโหลด…</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-4 bg-black text-white',
          mode === 'immersive' ? 'fixed inset-0 z-immersive' : 'h-full w-full',
        )}
      >
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10">
          <SparklesIcon className="h-8 w-8 text-white/60" />
        </div>
        <div className="px-6 text-center">
          <p className="font-display text-base font-bold">ยังไม่มีคลิป</p>
          <p className="mt-1 text-xs text-white/60">
            ครีเอเตอร์กำลังลงคลิปใหม่ ๆ — กลับมาเร็ว ๆ นี้
          </p>
        </div>
        <Link
          href="/feed/shop"
          className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-ink-900"
        >
          เปิดดูสินค้า
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-black text-white',
        mode === 'immersive'
          ? 'fixed inset-0 z-immersive'
          : 'relative h-[100dvh] w-full overflow-hidden',
      )}
    >
      {/* === Desktop side rails (≥lg) ======================================
          - Left: brand + tabs
          - Center: phone-frame reel
          - Right: actions (mirrored) + creator info
          On mobile we use the full screen and float actions on top.
      */}

      <div className="relative h-full w-full lg:flex lg:items-stretch lg:justify-center">
        {/* Top tabs (For You / Following) — overlay on mobile, inline on desktop */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center lg:hidden"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
          }}
        >
          <div className="pointer-events-auto flex items-center gap-5 text-sm font-semibold">
            <span className="text-white/55">กำลังติดตาม</span>
            <span className="relative text-white">
              สำหรับคุณ
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-white" />
            </span>
          </div>
        </div>

        {/* Top-right controls (mute + search) — overlay on mobile */}
        <div
          className="pointer-events-none absolute right-3 top-0 z-30 flex flex-col items-end gap-2 lg:hidden"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
          }}
        >
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/40 backdrop-blur"
          >
            {muted ? (
              <VolumeOffIcon className="h-4 w-4" />
            ) : (
              <VolumeOnIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* === Reel container (mobile = full bleed, desktop = phone frame) === */}
        <div
          ref={scrollerRef}
          className={cn(
            'h-full snap-y snap-mandatory overflow-y-scroll',
            'lg:my-6 lg:aspect-[9/16] lg:h-[calc(100dvh-7rem)] lg:w-auto lg:max-w-[440px] lg:rounded-3xl lg:shadow-pop',
            'hide-scrollbar',
          )}
          style={{
            scrollSnapType: 'y mandatory',
            overscrollBehaviorY: 'contain',
          }}
        >
          {items.map((v, i) => {
            const isActive = i === activeIdx;
            const saved = savedSet.has(v.id);
            return (
              <section
                key={v.id}
                ref={(el) => {
                  if (el) slideRefs.current.set(v.id, el);
                  else slideRefs.current.delete(v.id);
                }}
                data-video-id={v.id}
                className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden lg:h-full lg:rounded-3xl"
              >
                {/* Video / poster */}
                {v.videoUrl ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(v.id, el);
                      else videoRefs.current.delete(v.id);
                    }}
                    src={v.videoUrl}
                    poster={v.thumbUrl ?? undefined}
                    className="h-full w-full object-cover"
                    muted={muted}
                    loop
                    playsInline
                    preload={Math.abs(i - activeIdx) <= 1 ? 'auto' : 'none'}
                    onClick={onTapVideo}
                    onEnded={() => {
                      if (!completedSet.current.has(v.id)) {
                        completedSet.current.add(v.id);
                        tracker.track('video_complete', {
                          entityType: 'video',
                          entityId: v.id,
                          surface,
                        });
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={onTapVideo}
                    className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-500 via-brand to-violet-500"
                  >
                    <PlayIcon className="h-16 w-16 opacity-70" />
                  </button>
                )}

                {/* Paused indicator (only on active slide) */}
                {isActive && paused ? (
                  <button
                    type="button"
                    onClick={onTapVideo}
                    aria-label="เล่นต่อ"
                    className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20"
                  >
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-black/50 backdrop-blur">
                      <PlayIcon className="h-10 w-10" />
                    </span>
                  </button>
                ) : null}

                {/* Bottom gradient for legibility */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent lg:hidden" />

                {/* === Right action rail =================================== */}
                <div
                  className="absolute right-2 z-20 flex flex-col items-center gap-4"
                  style={{
                    bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)',
                  }}
                >
                  {/* Creator avatar with + follow */}
                  <div className="relative">
                    <Link
                      href={`/profile/${v.authorId}`}
                      className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white bg-brand-gradient text-sm font-bold text-white"
                    >
                      {v.authorName.slice(0, 1).toUpperCase()}
                    </Link>
                    <button
                      type="button"
                      aria-label="ติดตาม"
                      className="absolute -bottom-2 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-brand text-white shadow-glow"
                    >
                      <PlusIcon className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Like */}
                  <button
                    type="button"
                    disabled={!token}
                    onClick={() => {
                      if (!token) return;
                      likeM.mutate(v.id);
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'grid h-11 w-11 place-items-center rounded-full transition active:scale-90',
                        v.liked ? 'bg-rose-500 text-white shadow-glow' : 'bg-white/15 backdrop-blur',
                      )}
                    >
                      <HeartIcon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold drop-shadow">
                      {formatCount(v.likes)}
                    </span>
                  </button>

                  {/* Comment (placeholder for v2) */}
                  <button
                    type="button"
                    className="flex flex-col items-center gap-1"
                    onClick={() =>
                      tracker.track('chat_open', {
                        entityType: 'video',
                        entityId: v.id,
                        surface,
                      })
                    }
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur active:scale-90">
                      <CommentIcon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold drop-shadow">
                      {formatCount(v.comments ?? 0)}
                    </span>
                  </button>

                  {/* Save / Bookmark */}
                  <button
                    type="button"
                    onClick={() => toggleSave(v.id)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'grid h-11 w-11 place-items-center rounded-full transition active:scale-90',
                        saved ? 'bg-amber-400 text-ink-900 shadow-glow' : 'bg-white/15 backdrop-blur',
                      )}
                    >
                      <BookmarkIcon
                        className="h-5 w-5"
                        fill={saved ? 'currentColor' : 'none'}
                      />
                    </span>
                    <span className="text-[11px] font-semibold drop-shadow">บันทึก</span>
                  </button>

                  {/* Share */}
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/feed?v=${v.id}`;
                      tracker.track('share', {
                        entityType: 'video',
                        entityId: v.id,
                        surface,
                      });
                      void nativeShare({
                        title: v.caption || 'NP Video',
                        text: v.caption || 'มาดูคลิปนี้กัน',
                        url,
                      });
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur active:scale-90">
                      <ShareIcon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold drop-shadow">แชร์</span>
                  </button>

                  {/* Phase 12.2 — Report button.
                      Always rendered (anon users see a login prompt inside the sheet)
                      EXCEPT when viewing your own video — reporting yourself doesn't
                      make sense and the server rejects it anyway. */}
                  {(!user || user.id !== v.authorId) && (
                    <button
                      type="button"
                      onClick={() => setReportTarget(v.id)}
                      className="flex flex-col items-center gap-1"
                      aria-label="รายงานคลิป"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur active:scale-90">
                        <MoreVerticalIcon className="h-5 w-5" />
                      </span>
                      <span className="text-[11px] font-semibold drop-shadow">เพิ่มเติม</span>
                    </button>
                  )}

                  {/* Music disc (spins while playing) */}
                  <div
                    className={cn(
                      'grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-ink-700 to-ink-900 ring-2 ring-white/30',
                      isActive && !paused ? 'animate-spin-slow' : '',
                    )}
                    aria-hidden
                  >
                    <MusicIcon className="h-4 w-4 text-white/80" />
                  </div>
                </div>

                {/* === Bottom caption + product CTA ======================== */}
                <div
                  className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pr-20"
                  style={{
                    paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
                  }}
                >
                  <div className="space-y-2">
                    <Link
                      href={`/profile/${v.authorId}`}
                      className="inline-flex items-center gap-2"
                    >
                      <span className="font-display text-sm font-bold drop-shadow">
                        @{v.authorName}
                      </span>
                      {v.shopName ? (
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                          {v.shopName}
                        </span>
                      ) : null}
                    </Link>
                    {v.caption ? (
                      <p className="line-clamp-3 text-[13px] leading-relaxed drop-shadow">
                        {v.caption}
                      </p>
                    ) : null}
                    {/* Hashtags (parse from caption-ish tags) */}
                    <ParsedTags tagsJson={v.tagsJson} />
                    {/* Music ticker */}
                    <div className="flex items-center gap-2 text-[11px] font-medium opacity-90">
                      <MusicIcon className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">
                        เพลงต้นฉบับ · {v.authorName}
                      </span>
                    </div>

                    {/* Product CTA pill (sticky bottom of caption) */}
                    {v.productId && v.productName ? (
                      <Link
                        href={`/product/${v.productId}`}
                        onClick={() =>
                          tracker.track('reco_click', {
                            entityType: 'product',
                            entityId: v.productId!,
                            surface,
                            meta: { from: 'video', videoId: v.id },
                          })
                        }
                        className="mt-2 inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-white/95 px-3 py-2 text-ink-900 shadow-pop backdrop-blur"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white">
                          <BagIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-[11px] font-semibold">
                            {v.productName}
                          </p>
                          {formatBaht(v.productPriceCents) ? (
                            <p className="text-[12px] font-bold text-brand">
                              {formatBaht(v.productPriceCents)}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-brand-gradient px-3 py-1.5 text-[11px] font-semibold text-white">
                          ซื้อเลย
                        </span>
                      </Link>
                    ) : null}
                  </div>
                </div>

                {/* Progress dots (mobile) */}
                {isActive ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-1 z-0 flex justify-center gap-0.5 px-12 lg:hidden">
                    {/* placeholder — could wire <video> currentTime */}
                  </div>
                ) : null}
              </section>
            );
          })}

          {/* Loading more spinner */}
          {feedQ.isFetchingNextPage ? (
            <div className="flex h-20 items-center justify-center text-xs text-white/60">
              กำลังโหลดเพิ่ม…
            </div>
          ) : null}
        </div>

        {/* === Desktop side panel — creator info + comments placeholder ====== */}
        <aside className="hidden h-[calc(100dvh-7rem)] w-[320px] flex-col gap-4 self-center pl-6 lg:flex">
          {items[activeIdx] ? (
            <DesktopSidePanel item={items[activeIdx]!} surface={surface} />
          ) : null}
        </aside>
      </div>

      {/* Phase 12.2 — Report bottom-sheet. Rendered at root so it sits above
          the snap-scroll container + bottom nav regardless of viewport. */}
      {reportTarget && (
        <ReportSheet
          videoId={reportTarget}
          open
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ParsedTags({ tagsJson }: { tagsJson: string }): JSX.Element | null {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string').slice(0, 4);
  } catch {
    return null;
  }
  if (tags.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-1 text-[11px] font-medium text-white/85">
      {tags.map((t) => (
        <span key={t} className="text-brand-200">
          #{t}
        </span>
      ))}
    </p>
  );
}

function DesktopSidePanel({
  item,
  surface,
}: {
  item: VideoFeedItem;
  surface: string;
}): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 text-white backdrop-blur">
      {/* Creator card */}
      <div className="flex items-center gap-3">
        <Link
          href={`/profile/${item.authorId}`}
          className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border-2 border-white bg-brand-gradient text-sm font-bold"
        >
          {item.authorName.slice(0, 1).toUpperCase()}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold">
            @{item.authorName}
          </p>
          {item.shopName ? (
            <p className="truncate text-xs text-white/65">{item.shopName}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink-900"
        >
          ติดตาม
        </button>
      </div>

      {item.caption ? (
        <p className="text-sm leading-relaxed text-white/85">{item.caption}</p>
      ) : null}

      {item.productId && item.productName ? (
        <Link
          href={`/product/${item.productId}`}
          onClick={() =>
            tracker.track('reco_click', {
              entityType: 'product',
              entityId: item.productId!,
              surface,
              meta: { from: 'video_desktop_panel', videoId: item.id },
            })
          }
          className="flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-3 py-3 text-ink-900 shadow-pop"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient text-white">
            <BagIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-semibold">{item.productName}</p>
            {formatBaht(item.productPriceCents) ? (
              <p className="text-sm font-bold text-brand">
                {formatBaht(item.productPriceCents)}
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white">
            ซื้อเลย
          </span>
        </Link>
      ) : null}

      <div className="mt-auto flex items-center gap-3 text-xs text-white/55">
        <span>❤️ {formatCount(item.likes)}</span>
        <span>·</span>
        <span>▶︎ {formatCount(item.views)}</span>
        <span>·</span>
        <span>💬 {formatCount(item.comments ?? 0)}</span>
      </div>

      {/* Comments placeholder */}
      <div className="rounded-2xl border border-dashed border-white/15 p-3 text-center text-[11px] text-white/50">
        💬 ความคิดเห็นกำลังจะมาเร็ว ๆ นี้
      </div>
    </div>
  );
}
