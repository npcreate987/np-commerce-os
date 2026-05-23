'use client';

/**
 * Phase 14.3 — PDP MOBILE variant (the original phone layout).
 *
 * Moved verbatim from `page.tsx`; only change is the export name and
 * that it owns its own data fetching (so the desktop variant can do the
 * same — React Query dedupes via the `['product', id]` cache key).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import Link from 'next/link';
import {
  BagIcon,
  ChevronLeftIcon,
  HeartIcon,
  LinkIcon,
  MegaphoneIcon,
  MinusIcon,
  PlusIcon,
  ShieldCheckIcon,
  TruckIcon,
} from '@/components/icons';
import { getRefCode } from '@/lib/affiliate';

export function MobilePDP(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
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
      <main className="container-mobile py-4">
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="mt-4 h-6 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/3" />
      </main>
    );
  }

  const cover = data.media[0]?.url ?? null;
  const oos = data.stock <= 0;

  return (
    <main className="pb-40">
      <div className="relative">
        <div className="aspect-square w-full overflow-hidden bg-ink-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={data.name} className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white via-white/30 to-transparent" />
        </div>
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-between p-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <button
            onClick={() => router.back()}
            aria-label="ย้อนกลับ"
            className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-ink-900 active:scale-95"
          >
            <ChevronLeftIcon />
          </button>
          <button
            aria-label="ถูกใจ"
            className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-ink-700 active:scale-95"
          >
            <HeartIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="container-mobile relative -mt-8 space-y-4 rounded-t-[28px] bg-white pt-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="flex-1 text-balance text-xl font-bold leading-tight text-ink-900">
              {data.name}
            </h1>
            {oos ? <Badge tone="danger">หมด</Badge> : null}
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold tracking-tight text-brand">
              {formatTHB(data.priceCents)}
            </p>
            <span className="text-xs text-ink-400">คงเหลือ {data.stock} ชิ้น</span>
          </div>
          {ratingQ.data && ratingQ.data.count > 0 ? (
            <RatingPill avg={ratingQ.data.avg} count={ratingQ.data.count} />
          ) : null}
        </div>

        {data.description ? (
          <div className="rounded-3xl border border-ink-100 bg-ink-50/50 p-4">
            <p className="text-sm leading-relaxed text-ink-700">{data.description}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-ink-100 bg-white p-3">
            <ShieldCheckIcon className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-ink-900">NP Protect</p>
              <p className="text-[10px] text-ink-500">คืนเงิน 100%</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-ink-100 bg-white p-3">
            <TruckIcon className="h-5 w-5 shrink-0 text-sky-600" />
            <div>
              <p className="text-xs font-semibold text-ink-900">เลือกขนส่ง</p>
              <p className="text-[10px] text-ink-500">ไม่ผูกขาด</p>
            </div>
          </div>
        </div>

        {refCode && refResolve.data && (
          <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-gradient-to-r from-brand-50 to-fuchsia-50 p-3">
            <LinkIcon className="h-5 w-5 shrink-0 text-brand" />
            <p className="text-xs text-ink-900">
              แนะนำโดย{' '}
              <strong className="text-brand">
                {refResolve.data.creator.displayName}
              </strong>{' '}
              · ราคาเหมือนเดิม
            </p>
          </div>
        )}

        {creatorMe.data && (
          <Link
            href="/creator/links"
            className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 active:bg-ink-50"
          >
            <MegaphoneIcon className="h-5 w-5 shrink-0 text-brand" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-900">โปรโมทสินค้านี้</p>
              <p className="text-[10px] text-ink-500">
                สร้างลิงก์ของคุณเพื่อรับคอมมิชชั่น
              </p>
            </div>
            <span className="text-xs font-semibold text-brand">สร้างลิงก์ →</span>
          </Link>
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
      </div>

      <div
        className="glass-strong fixed inset-x-0 bottom-16 z-20 border-t border-white/40"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="container-mobile flex items-center gap-3 pt-3">
          <div className="flex h-12 items-center rounded-2xl border border-ink-100 bg-white">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex h-12 w-10 items-center justify-center text-ink-700 active:bg-ink-50"
              aria-label="ลด"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums text-ink-900">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(data.stock, q + 1))}
              className="flex h-12 w-10 items-center justify-center text-ink-700 active:bg-ink-50"
              aria-label="เพิ่ม"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
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
        </div>
        {addToCart.error instanceof ApiError ? (
          <p className="container-mobile pb-2 pt-1 text-xs text-red-600">
            {addToCart.error.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
