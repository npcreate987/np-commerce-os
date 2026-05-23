'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { formatTHB } from '@/lib/format';
import type { BuyAgainItem, ProductRecommendation } from '@np/types';
import { SparklesIcon } from '@/components/icons';
import { tracker } from '@/lib/track';

type StripItem =
  | ({ kind: 'rec' } & ProductRecommendation)
  | ({ kind: 'buy-again' } & BuyAgainItem);

interface Props {
  title: string;
  caption?: string;
  items: StripItem[];
  emptyText?: string;
  isLoading?: boolean;
  /** Where this strip lives — used as the `surface` tag on impression/click
   *  events. E.g. 'home_for_you', 'pdp_similar', 'home_buy_again'. */
  surface?: string;
}

/**
 * Horizontal scrollable strip — used for For You / Similar / Buy Again.
 * Cards are 40vw wide on mobile so two-and-a-bit cards peek into view.
 */
export function RecommendationStrip({
  title,
  caption,
  items,
  emptyText,
  isLoading,
  surface,
}: Props): JSX.Element | null {
  const impressionFired = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!surface) return;
    for (const item of items) {
      if (impressionFired.current.has(item.productId)) continue;
      impressionFired.current.add(item.productId);
      tracker.track('reco_impression', {
        entityType: 'product',
        entityId: item.productId,
        surface,
        meta:
          item.kind === 'rec'
            ? { reason: item.reason, score: item.score }
            : { reason: 'BUY_AGAIN', timesBought: item.timesBought },
      });
    }
  }, [items, surface]);

  function onCardClick(item: StripItem): void {
    if (!surface) return;
    tracker.track('reco_click', {
      entityType: 'product',
      entityId: item.productId,
      surface,
      meta:
        item.kind === 'rec'
          ? { reason: item.reason, score: item.score }
          : { reason: 'BUY_AGAIN' },
    });
  }

  if (isLoading) {
    return (
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div>
            {caption ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {caption}
              </p>
            ) : null}
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
              {title}
            </h2>
          </div>
        </div>
        <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 w-36 shrink-0 animate-pulse rounded-2xl bg-ink-100"
            />
          ))}
        </div>
      </section>
    );
  }
  if (!items || items.length === 0) {
    if (!emptyText) return null;
    return (
      <section className="mt-6">
        <div className="mb-2">
          {caption ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {caption}
            </p>
          ) : null}
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
            {title}
          </h2>
        </div>
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-xs text-ink-500">
          {emptyText}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          {caption ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {caption}
            </p>
          ) : null}
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
            {title}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand">
          <SparklesIcon className="h-3 w-3" />
          AI
        </span>
      </div>
      <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
        {items.map((item) => (
          <Link
            key={item.productId}
            href={`/product/${item.productId}`}
            onClick={() => onCardClick(item)}
            className="group w-36 shrink-0 active:scale-[0.98]"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-100">
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-100 to-fuchsia-100">
                  <SparklesIcon className="h-6 w-6 text-brand/40" />
                </div>
              )}
              {item.kind === 'rec' ? <ReasonBadge reason={item.reason} /> : null}
            </div>
            <div className="mt-2">
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-ink-900">
                {item.name}
              </p>
              <p className="mt-0.5 text-sm font-bold text-brand">
                {formatTHB(item.priceCents)}
              </p>
              {item.kind === 'rec' ? (
                <p className="mt-1 text-[10px] text-ink-400">{item.reasonText}</p>
              ) : (
                <p className="mt-1 text-[10px] text-ink-400">
                  เคยซื้อ {item.timesBought} ครั้ง
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Tiny visual cue for the dominant signal in this recommendation.
 * Kept subtle — we don't want the feed to look like a debug overlay.
 */
function ReasonBadge({
  reason,
}: {
  reason: ProductRecommendation['reason'];
}): JSX.Element | null {
  const map: Partial<Record<ProductRecommendation['reason'], { label: string; cls: string }>> = {
    TRENDING: { label: '🔥 มาแรง', cls: 'bg-rose-500 text-white' },
    BECAUSE_VIEWED: { label: '👀 เพราะคุณดู', cls: 'bg-fuchsia-500 text-white' },
    FAVOURITE_SHOP: { label: '⭐ ร้านโปรด', cls: 'bg-amber-500 text-white' },
    EXPLORE: { label: '✨ ลองดู', cls: 'bg-emerald-500 text-white' },
  };
  const cfg = map[reason];
  if (!cfg) return null;
  return (
    <span
      className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold shadow ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
