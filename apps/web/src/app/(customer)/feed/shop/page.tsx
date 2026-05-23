'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { ProductCard } from '@/components/product-card';
import { RecommendationStrip } from '@/components/recommendation-strip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Orb } from '@/components/ui/glass';
import {
  ArrowRightIcon,
  BagIcon,
  FlameIcon,
  HeartIcon,
  MapPinIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  TicketIcon,
  TruckIcon,
  VideoIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useTrackOnce } from '@/lib/track-hooks';

/**
 * Customer Shop home — formerly `/feed`, relocated under `/feed/shop` after
 * Phase 12 promoted `/feed` to the TikTok-style video reel.
 *
 * Sections (top → bottom):
 *   1. Mobile secondary header (greeting + category chips)
 *   2. Desktop hero strip (greeting + categories)
 *   3. Bento promo grid (NP Protect, reel CTA, coupons, points, etc.)
 *   4. AI "For You" strip (logged-in)
 *   5. Trending strip (public)
 *   6. Personalised proactive rails (logged-in)
 *   7. Product grid (full catalog snapshot)
 */
const categories = [
  { id: 'all', label: 'ทั้งหมด', icon: <SparklesIcon className="h-3.5 w-3.5" /> },
  { id: 'flash', label: 'Flash Deal', icon: <span className="text-sm">⚡</span> },
  { id: 'fav', label: 'ที่ชอบ', icon: <HeartIcon className="h-3.5 w-3.5" /> },
];

export default function ShopHomePage(): JSX.Element {
  const [activeCat, setActiveCat] = useState<string>('all');
  const token = useAuthStore((s) => s.token);
  useTrackOnce('page_view', { surface: 'shop_home' });

  const productsQ = useQuery({
    queryKey: ['products', 'feed-shop'],
    queryFn: () => api.products.list(24),
  });

  const forYouQ = useQuery({
    queryKey: ['recs', 'for-you'],
    queryFn: () => api.recommendations.forYou(token!, 10),
    enabled: Boolean(token),
    retry: false,
  });

  const trendingQ = useQuery({
    queryKey: ['recs', 'trending'],
    queryFn: () => api.recommendations.trending(12),
    retry: false,
  });

  const railsQ = useQuery({
    queryKey: ['proactive', 'rails'],
    queryFn: () => api.proactive.rails(token!, 10),
    enabled: Boolean(token),
    retry: false,
  });

  return (
    <main className="relative">
      {/* Background mesh */}
      <div
        className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-mesh-soft lg:h-[260px]"
        aria-hidden
      />
      <Orb className="left-[-60px] top-[-40px] h-72 w-72 bg-brand/30 lg:opacity-50" />
      <Orb
        className="right-[-40px] top-20 h-64 w-64 bg-accent-violet/30 lg:opacity-50"
        style={{ animationDelay: '-3s' }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-noise opacity-[0.12] mix-blend-overlay" />

      {/* Mobile-only secondary header: greeting + category chips */}
      <div
        className="glass sticky z-30 border-b border-surface lg:hidden"
        style={{ top: 'calc(env(safe-area-inset-top) + var(--topbar-m, 56px))' }}
      >
        <div className="container-mobile flex h-12 items-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-faint">
            ช้อป
          </p>
          <span className="mx-2 text-surface-faint">·</span>
          <p className="font-display text-sm font-semibold tracking-tight text-surface-strong">
            ไปหาของกัน
          </p>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn('chip', activeCat === c.id && 'chip-active')}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop hero strip + chips */}
      <section className="hidden border-b border-surface bg-surface-raised/40 lg:block">
        <div className="container-app flex items-center gap-6 py-6">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              ช้อป · เลือกของ
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tightest text-surface-strong">
              ไปหาของกัน
            </h1>
            <p className="mt-1 text-sm text-surface-muted">
              เลือกของจากร้านที่คุณชอบ · AI ช่วยแนะนำให้ตรงรสนิยม · NP Protect คุ้มครองทุกออเดอร์
            </p>
          </div>
          <div className="hide-scrollbar flex max-w-[55%] gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={cn('chip', activeCat === c.id && 'chip-active')}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="container-app relative pt-5 lg:pt-8">
        {/* Bento promo + perks */}
        <section className="grid grid-cols-6 gap-3 lg:grid-cols-12 lg:gap-5">
          <Link
            href="/orders"
            className="col-span-6 lg:col-span-8 group relative overflow-hidden rounded-4xl bg-ink-900 p-5 text-white shadow-pop noise"
          >
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-brand/40 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-accent-violet/40 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-200 ring-1 ring-white/15">
                  <ShieldCheckIcon className="h-3 w-3" />
                  NP Protect
                </span>
                <h2 className="mt-3 font-display text-xl font-bold tracking-tightest">
                  ซื้อมั่นใจ คืนได้
                  <br />
                  ทุกร้าน
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-300">
                  เงินถูกพักจนของถึงมือ — ไม่ตรงปกคืน 100%
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
                <TruckIcon className="h-6 w-6 text-white" />
              </div>
            </div>
          </Link>

          {/* Short video feed — link back to /feed (the new home) */}
          <Link
            href="/feed"
            className="col-span-3 lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 p-3 text-white shadow-pop"
          >
            <VideoIcon className="mb-1 h-5 w-5" />
            <p className="font-display text-sm font-bold tracking-tight">คลิป</p>
            <p className="text-[10px] text-white/90">ดูสินค้าเด่นแบบ TikTok</p>
          </Link>
          <Link
            href="/rewards"
            className="col-span-3 lg:col-span-2 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-pop"
          >
            <TicketIcon className="mb-1 h-5 w-5" />
            <p className="font-display text-sm font-bold tracking-tight">คูปอง</p>
            <p className="text-[10px] text-white/90">เก็บโค้ดส่วนลด</p>
          </Link>
          <Link
            href="/rewards"
            className="col-span-3 lg:col-span-3 rounded-2xl bg-gradient-to-br from-brand to-violet-500 p-3 text-white shadow-pop"
          >
            <StarIcon className="mb-1 h-5 w-5" />
            <p className="font-display text-sm font-bold tracking-tight">แต้ม</p>
            <p className="text-[10px] text-white/90">10฿ = 1 แต้ม</p>
          </Link>
          <Link
            href="/rewards"
            className="col-span-3 lg:col-span-3 rounded-2xl bg-surface-raised p-3 ring-1 ring-surface shadow-card"
          >
            <FlameIcon className="mb-1 h-5 w-5 text-rose-500" />
            <p className="font-display text-sm font-bold tracking-tight text-surface-strong">
              ชวนเพื่อน
            </p>
            <p className="text-[10px] text-surface-muted">รับ 50 แต้ม/คน</p>
          </Link>

          {/* Local Commerce CTA */}
          <Link
            href="/local"
            className="group relative col-span-6 lg:col-span-8 overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-brand to-fuchsia-500 p-4 text-white shadow-pop noise"
          >
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                <MapPinIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wider text-white/80">
                  ร้านท้องถิ่น
                </p>
                <p className="font-display text-base font-bold tracking-tight">
                  ใกล้ฉัน — ส่งภายใน 60 นาที
                </p>
                <p className="text-[10px] text-white/80">
                  อาหาร · คาเฟ่ · ของชำ · ของฝาก
                </p>
              </div>
              <ArrowRightIcon className="h-4 w-4" />
            </div>
          </Link>

          {/* Creator + Rider programs */}
          <Link
            href="/apply-creator"
            className="group relative col-span-3 lg:col-span-2 overflow-hidden rounded-3xl bg-mesh-2 p-3 text-white shadow-pop"
          >
            <MegaphoneIcon className="mb-1 h-5 w-5" />
            <p className="font-display text-sm font-bold tracking-tight">Creator</p>
            <p className="text-[10px] text-white/85">แชร์ของรับคอมฯ</p>
          </Link>
          <Link
            href="/apply-rider"
            className="group relative col-span-3 lg:col-span-2 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3 text-white shadow-pop"
          >
            <span className="mb-1 inline-block text-xl">🛵</span>
            <p className="font-display text-sm font-bold tracking-tight">Rider</p>
            <p className="text-[10px] text-white/85">รับงานส่งใกล้ตัว</p>
          </Link>
        </section>

        {/* AI: For You strip — only when logged in */}
        {token ? (
          <RecommendationStrip
            caption="แนะนำสำหรับคุณ"
            title="AI เลือกให้"
            items={(forYouQ.data ?? []).map((r) => ({ kind: 'rec' as const, ...r }))}
            isLoading={forYouQ.isLoading}
            surface="shop_for_you"
            emptyText={
              forYouQ.error
                ? undefined
                : 'ยังไม่มีคำแนะนำ — ลองเข้าดูสินค้าก่อน เดี๋ยว AI จะแนะนำให้'
            }
          />
        ) : null}

        {/* Trending — public */}
        <RecommendationStrip
          caption="กำลังมาแรงสัปดาห์นี้"
          title="มาแรง 🔥"
          items={(trendingQ.data ?? []).map((r) => ({ kind: 'rec' as const, ...r }))}
          isLoading={trendingQ.isLoading}
          surface="shop_trending"
        />

        {/* Personalised rails (Phase 10.3) */}
        {token
          ? (railsQ.data ?? []).map((rail) => (
              <RecommendationStrip
                key={rail.kind}
                caption={rail.caption}
                title={rail.title}
                items={rail.items.map((r) => ({ kind: 'rec' as const, ...r }))}
                surface={`shop_${rail.kind.toLowerCase()}`}
              />
            ))
          : null}

        {/* Section header */}
        <div className="mt-8 flex items-baseline justify-between lg:mt-12">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-faint">
              สำหรับคุณ
            </p>
            <h2 className="font-display text-xl font-bold tracking-tightest text-surface-strong lg:text-2xl">
              สินค้าแนะนำ
            </h2>
          </div>
          <button
            type="button"
            onClick={() => productsQ.refetch()}
            className="text-xs font-semibold text-brand active:scale-95 lg:text-sm"
            disabled={productsQ.isRefetching}
          >
            {productsQ.isRefetching ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>

        {productsQ.isLoading ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-5 lg:grid-cols-5 lg:gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : null}

        {productsQ.error ? (
          <div className="mt-3">
            <EmptyState
              icon={<BagIcon />}
              title="โหลดสินค้าไม่ได้"
              description={`ตรวจสอบว่า API รันอยู่ ${
                productsQ.error instanceof Error ? `(${productsQ.error.message})` : ''
              }`}
            />
          </div>
        ) : null}

        {productsQ.data && productsQ.data.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-5 lg:grid-cols-5 lg:gap-5">
            {productsQ.data.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : null}

        {productsQ.data && productsQ.data.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<BagIcon />}
              title="ยังไม่มีสินค้า"
              description="ร้านค้ายังไม่ลงสินค้าเลย ลองกลับมาดูใหม่"
              action={
                <Link
                  href="/feed"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-xs font-semibold text-white shadow-glow"
                >
                  กลับฟีดคลิป
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              }
            />
          </div>
        ) : null}

        <div className="h-24 lg:h-12" aria-hidden />
      </div>
    </main>
  );
}
