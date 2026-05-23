'use client';

/**
 * Phase 14.4 — Checkout MOBILE layout.
 *
 * Vertical stack of sections + fixed-bottom CTA bar (original UX).
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTHB } from '@/lib/format';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import type { CheckoutState } from './_state';
import {
  AddressSection,
  CarrierSection,
  CouponLoyaltySection,
  ItemsSection,
  PaymentSection,
  ReferralBadge,
} from './_sections';

export function MobileCheckout({ s }: { s: CheckoutState }): JSX.Element {
  if (s.cartLoading || !s.cart) {
    return (
      <main className="container-mobile py-6 pb-28">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-4 h-40" />
        <Skeleton className="mt-4 h-60" />
      </main>
    );
  }

  return (
    <main className="pb-44">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/cart"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
            ชำระเงิน
          </h1>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void s.submit();
        }}
        className="container-mobile space-y-4 pt-4"
      >
        <ItemsSection s={s} />
        <AddressSection s={s} />
        <CouponLoyaltySection s={s} />
        <CarrierSection s={s} />
        <PaymentSection s={s} />

        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
          <ShieldCheckIcon className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-xs text-emerald-900">
            คุ้มครองโดย <strong>NP Protect</strong> — เงินถูกพักจนกว่าคุณกดยืนยันรับสินค้า
          </p>
        </div>

        <ReferralBadge s={s} />

        {s.submitError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-medium text-red-700">{s.submitError}</p>
          </div>
        )}

        <div
          className="glass-strong fixed inset-x-0 bottom-16 z-20 border-t border-white/40"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <div className="container-mobile flex items-center justify-between gap-3 pt-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400">
                รวมทั้งสิ้น
              </p>
              <p className="text-lg font-bold tracking-tight text-brand">
                {formatTHB(s.totalCents)}
              </p>
              <p className="text-[10px] text-ink-500">
                สินค้า {formatTHB(s.cart.subtotalCents)} · ส่ง{' '}
                {s.shippingCents === 0 ? 'ฟรี' : formatTHB(s.shippingCents)}
                {s.totalDiscountCents > 0
                  ? ` · ลด ${formatTHB(s.totalDiscountCents)}`
                  : ''}
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              loading={s.submitLoading}
              rightIcon={!s.submitLoading ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
            >
              ยืนยันชำระเงิน
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
