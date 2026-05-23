'use client';

/**
 * Phase 14.3 — PDP DESKTOP variant (Shopify / Amazon / Lazada pattern).
 *
 *   ┌──────────────────────────────────┬─────────────────────────────┐
 *   │  ┌────────────────────────────┐  │  Product name               │
 *   │  │                            │  │  ★★★★★ (124)                 │
 *   │  │     Main image 1:1         │  │  ฿1,290                     │
 *   │  │                            │  │  สต๊อก: 12 ชิ้น              │
 *   │  └────────────────────────────┘  │                             │
 *   │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐        │  [-] 1 [+]                  │
 *   │  │  │ │  │ │  │ │  │ │  │ thumbs │  [   หยิบใส่ตะกร้า    ]      │  sticky
 *   │  └──┘ └──┘ └──┘ └──┘ └──┘        │                             │
 *   │                                  │  ✓ NP Protect คืน 100%      │
 *   │  ── รายละเอียดสินค้า ──         │  ✓ เลือกขนส่งเองได้          │
 *   │  {description prose, full text}  │  ✓ ผู้แนะนำ (if referral)   │
 *   │                                  │  ✓ โปรโมท (if creator)      │
 *   └──────────────────────────────────┴─────────────────────────────┘
 *
 *   ── สินค้าที่คล้ายกัน ── { strip across full width }
 *   ── รีวิวลูกค้า ──        { full width }
 *
 * Key differences from mobile:
 *  - Image isn't full-bleed: clipped to grid cell + thumbnail strip.
 *  - Buy box (right column, sticky) takes the spot where mobile uses a
 *    fixed bottom CTA — no overlay required.
 *  - Description gets full prose treatment under the gallery instead of
 *    being squashed in a small card.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RecommendationStrip } from '@/components/recommendation-strip';
import { ReviewsSection } from '@/components/reviews-section';
import { tracker } from '@/lib/track';
import { useDwellTracker, useScrollDepth, useTrackOnce } from '@/lib/track-hooks';
import { RatingPill } from '@/components/rating';
import { formatTHB } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  BagIcon,
  HeartIcon,
  LinkIcon,
  MegaphoneIcon,
  MinusIcon,
  PlusIcon,
  ShareIcon,
  ShieldCheckIcon,
  TruckIcon,
} from '@/components/icons';
import { getRefCode } from '@/lib/affiliate';
import type { ProductMedia } from '@np/types';

export function DesktopPDP(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    setRefCode(getRefCode());
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.products.getById(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!id) return;
    api.recommendations.trackView(id, 'product-detail').catch(() => undefined);
  }, [id]);

  useTrackOnce('product_view', {
    entityType: 'product',
    entityId: id,
    surface: 'pdp',
  });
  useDwellTracker({
    kind: 'product_dwell',
    entityType: 'product',
    entityId: id,
    surface: 'pdp',
    thresholdMs: 30_000,
  });
  useScrollDepth({
    entityType: 'product',
    entityId: id,
    surface: 'pdp',
    threshold: 0.75,
  });

  const similarQ = useQuery({
    queryKey: ['recs', 'similar', id],
    queryFn: () => api.recommendations.similar(id, 8),
    enabled: Boolean(id),
    retry: false,
  });
  const ratingQ = useQuery({
    queryKey: ['reviews', 'product', id, 'summary'],
    queryFn: () => api.reviews.productSummary(id),
    enabled: Boolean(id),
    retry: false,
  });
  const refResolve = useQuery({
    queryKey: ['ref-resolve', refCode],
    queryFn: () => api.creators.resolveLink(refCode!),
    enabled: Boolean(refCode),
    retry: false,
  });
  const creatorMe = useQuery({
    queryKey: ['creator', 'me'],
    queryFn: () => api.creators.me(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const addToCart = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.cart.add(token, { productId: id, quantity: qty });
    },
    onSuccess: () => {
      tracker.track('add_to_cart', {
        entityType: 'product',
        entityId: id,
        surface: 'pdp',
        meta: { quantity: qty },
      });
      qc.invalidateQueries({ queryKey: ['cart'] });
      router.push('/cart');
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'LOGIN_REQUIRED') router.push('/login');
    },
  });

  if (isLoading || !data) {
    return (
      <main className="mx-auto grid max-w-screen-xl gap-8 px-6 py-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="flex gap-2">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <Skeleton className="h-16 w-16 rounded-lg" />
            <Skeleton className="h-16 w-16 rounded-lg" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-12 w-full" />
        </div>
      </main>
    );
  }

  const images = data.media.filter((m): m is ProductMedia => m.kind === 'IMAGE');
  const activeMedia = images[activeMediaIdx] ?? images[0] ?? null;
  const oos = data.stock <= 0;

  return (
    <>
      <main className="mx-auto grid max-w-screen-xl gap-10 px-6 py-8 lg:grid-cols-[1fr_400px]">
        {/* ============== LEFT: Gallery + long-form details ============== */}
        <section className="min-w-0 space-y-6">
          <Gallery
            images={images}
            activeIdx={activeMediaIdx}
            onSelect={setActiveMediaIdx}
            active={activeMedia}
            name={data.name}
          />

          {data.description && (
            <div className="rounded-2xl border border-ink-100 bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-ink-900">
                รายละเอียดสินค้า
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {data.description}
              </p>
            </div>
          )}

          <RecommendationStrip
            caption="คุณอาจชอบ"
            title="สินค้าที่คล้ายกัน"
            items={(similarQ.data ?? []).map((r) => ({
              kind: 'rec' as const,
              ...r,
            }))}
            isLoading={similarQ.isLoading}
            surface="pdp_similar"
          />

          <ReviewsSection productId={id} />
        </section>

        {/* ============== RIGHT: Sticky buy box ============== */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h1 className="flex-1 text-balance text-xl font-bold leading-tight text-ink-900">
                  {data.name}
                </h1>
                {oos && <Badge tone="danger">หมด</Badge>}
              </div>
              {ratingQ.data && ratingQ.data.count > 0 && (
                <RatingPill avg={ratingQ.data.avg} count={ratingQ.data.count} />
              )}
            </div>

            <div className="rounded-xl bg-brand-50 px-4 py-3">
              <p className="text-3xl font-extrabold tracking-tight text-brand">
                {formatTHB(data.priceCents)}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                คงเหลือ {data.stock} ชิ้น
              </p>
            </div>

            {/* Quantity + Add to cart */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-700">จำนวน</p>
              <div className="flex items-center gap-3">
                <div className="flex h-11 items-center rounded-xl border border-ink-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-11 w-10 items-center justify-center text-ink-700 transition hover:bg-ink-50"
                    aria-label="ลด"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold tabular-nums text-ink-900">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(data.stock, q + 1))}
                    className="flex h-11 w-10 items-center justify-center text-ink-700 transition hover:bg-ink-50"
                    aria-label="เพิ่ม"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-ink-500">
                  รวม{' '}
                  <strong className="text-ink-900">
                    {formatTHB(data.priceCents * qty)}
                  </strong>
                </span>
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              disabled={oos}
              loading={addToCart.isPending}
              leftIcon={<BagIcon className="h-4 w-4" />}
              onClick={() => addToCart.mutate()}
            >
              {oos ? 'สินค้าหมด' : 'หยิบใส่ตะกร้า'}
            </Button>

            {addToCart.error instanceof ApiError && (
              <p className="text-xs text-red-600">{addToCart.error.message}</p>
            )}

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="ถูกใจ"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <HeartIcon className="h-3.5 w-3.5" /> ถูกใจ
              </button>
              <button
                type="button"
                aria-label="แชร์"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard?.writeText(window.location.href);
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <ShareIcon className="h-3.5 w-3.5" /> แชร์
              </button>
            </div>

            {/* Trust badges (stacked, vertically) */}
            <div className="space-y-2 border-t border-ink-100 pt-4">
              <TrustRow
                icon={<ShieldCheckIcon className="h-4 w-4 text-emerald-600" />}
                title="NP Protect"
                sub="คืนเงิน 100% ถ้าได้ไม่ตรงปก"
              />
              <TrustRow
                icon={<TruckIcon className="h-4 w-4 text-sky-600" />}
                title="เลือกขนส่งเองได้"
                sub="ไม่ผูกขาดบริษัทใดบริษัทหนึ่ง"
              />
            </div>

            {refCode && refResolve.data && (
              <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand-50 p-3">
                <LinkIcon className="h-4 w-4 shrink-0 text-brand" />
                <p className="text-xs text-ink-800">
                  แนะนำโดย{' '}
                  <strong className="text-brand">
                    {refResolve.data.creator.displayName}
                  </strong>
                </p>
              </div>
            )}

            {creatorMe.data && (
              <Link
                href="/creator/links"
                className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/50"
              >
                <MegaphoneIcon className="h-4 w-4 shrink-0 text-brand" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-ink-900">โปรโมทสินค้านี้</p>
                  <p className="text-[10px] text-ink-500">
                    สร้างลิงก์ของคุณ รับคอมมิชชั่นทุกคำสั่งซื้อ
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand">→</span>
              </Link>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}

// ---------- Gallery ---------------------------------------------------------

function Gallery({
  images,
  activeIdx,
  onSelect,
  active,
  name,
}: {
  images: ProductMedia[];
  activeIdx: number;
  onSelect: (i: number) => void;
  active: ProductMedia | null;
  name: string;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-ink-100">
        {active ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={active.url}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-300">
            <span className="text-sm">ไม่มีรูป</span>
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`เลือกรูปที่ ${i + 1}`}
              className={cn(
                'h-16 w-16 overflow-hidden rounded-lg border-2 transition',
                i === activeIdx
                  ? 'border-brand shadow-glow'
                  : 'border-ink-200 hover:border-ink-300',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrustRow({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-ink-900">{title}</p>
        <p className="text-[10px] text-ink-500">{sub}</p>
      </div>
    </div>
  );
}
