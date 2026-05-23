'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { StarRating } from '@/components/rating';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/cn';
import type { ReviewListItem, ReviewPhoto } from '@np/types';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}วินาทีที่แล้ว`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชั่วโมงที่แล้ว`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH');
}

export function ReviewsSection({
  productId,
}: {
  productId: string;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [lightbox, setLightbox] = useState<{
    photos: ReviewPhoto[];
    index: number;
  } | null>(null);

  const summaryQ = useQuery({
    queryKey: ['reviews', 'product', productId, 'summary'],
    queryFn: () => api.reviews.productSummary(productId),
  });
  const listQ = useQuery({
    queryKey: ['reviews', 'product', productId, 'list', token ? 'auth' : 'anon'],
    queryFn: () => api.reviews.listForProduct(productId, 20, token ?? undefined),
  });

  const sum = summaryQ.data;
  const list = listQ.data ?? [];
  const total = sum?.count ?? 0;

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            รีวิว
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
            ความคิดเห็นลูกค้า
          </h2>
        </div>
        {total > 0 ? (
          <span className="text-xs text-ink-500">{total} รีวิว</span>
        ) : null}
      </div>

      {summaryQ.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-xs text-ink-500">
          ยังไม่มีรีวิว — เป็นคนแรกหลังของถึงมือ
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-ink-100">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="font-display text-3xl font-bold tracking-tight text-ink-900">
                {sum!.avg.toFixed(1)}
              </p>
              <StarRating value={sum!.avg} size="sm" />
              <p className="mt-0.5 text-[10px] text-ink-500">
                จาก {sum!.count} รีวิว
              </p>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const c = sum!.histogram[star - 1] ?? 0;
                const pct = sum!.count > 0 ? (c / sum!.count) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-[10px]">
                    <span className="w-3 shrink-0 text-ink-500">{star}</span>
                    <span className="text-amber-400">★</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-ink-500">
                      {c}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {listQ.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : list.length > 0 ? (
        <ul className="space-y-2">
          {list.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onOpenPhoto={(i) =>
                setLightbox({ photos: r.photos ?? [], index: i })
              }
            />
          ))}
        </ul>
      ) : null}

      {lightbox ? (
        <Lightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  );
}

function ReviewCard({
  review,
  onOpenPhoto,
}: {
  review: ReviewListItem;
  onOpenPhoto: (index: number) => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const helpfulM = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.reviews.toggleHelpful(token, review.id);
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['reviews', 'product', review.productId, 'list'],
      }),
  });

  return (
    <li
      className={cn(
        'rounded-2xl border border-ink-100 bg-white p-3',
        review.flagReason ? 'opacity-90' : '',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink-900">
            {review.authorDisplay}
          </p>
          <StarRating value={review.rating} size="sm" />
        </div>
        <p className="text-[10px] text-ink-400">{timeAgo(review.createdAt)}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
        {review.body}
      </p>

      {review.photos.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.photos.map((p, i) => (
            <button
              type="button"
              key={p.id}
              onClick={() => onOpenPhoto(i)}
              className="h-16 w-16 overflow-hidden rounded-xl ring-1 ring-ink-100 active:scale-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="รูปรีวิว"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          disabled={!token || helpfulM.isPending}
          onClick={() => helpfulM.mutate()}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
            review.helpfulByMe
              ? 'border-brand-200 bg-brand-50 text-brand'
              : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
            !token && 'opacity-40',
          )}
          title={!token ? 'ล็อกอินเพื่อโหวต' : ''}
        >
          <span>👍</span>
          <span>
            {review.helpfulByMe ? 'ขอบคุณ!' : 'มีประโยชน์'}
            {review.helpfulCount > 0 ? ` · ${review.helpfulCount}` : ''}
          </span>
        </button>
      </div>
    </li>
  );
}

function Lightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: ReviewPhoto[];
  startIndex: number;
  onClose: () => void;
}): JSX.Element | null {
  const [i, setI] = useState(startIndex);
  if (photos.length === 0) return null;
  const current = photos[Math.max(0, Math.min(i, photos.length - 1))];
  if (!current) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
        aria-label="ปิด"
      >
        ✕
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-full max-w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt="รูปรีวิว"
          className="max-h-[80vh] max-w-full rounded-2xl object-contain"
        />
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setI((x) => (x - 1 + photos.length) % photos.length);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setI((x) => (x + 1) % photos.length);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-white"
            >
              ›
            </button>
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-0.5 text-[10px] text-white">
              {i + 1}/{photos.length}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
