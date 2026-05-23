'use client';

/**
 * Phase 14.4 — Checkout DESKTOP layout.
 *
 *   ┌──────────────────────────────────────┬───────────────────────┐
 *   │  ชำระเงิน  ←กลับตะกร้า                │  สรุปยอด               │
 *   │                                       │  ──────────           │
 *   │  📦 รายการสินค้า (3)                  │  ยอดสินค้า   ฿1,290    │
 *   │     ...                              │  ส่ง            ฿50    │
 *   │                                       │  ส่วนลด        −฿100   │
 *   │  📍 ที่อยู่จัดส่ง                       │  ─────────────        │
 *   │     [fullname][phone]                 │  รวม         ฿1,240    │  sticky
 *   │     [address...]                      │                       │
 *   │                                       │  [ ยืนยันชำระเงิน → ]  │
 *   │  🎟  ส่วนลด                            │                       │
 *   │  🚚 ผู้จัดส่ง  (2-col)                 │  ✓ NP Protect        │
 *   │  💳 วิธีชำระเงิน (3-col)               │                       │
 *   └──────────────────────────────────────┴───────────────────────┘
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

export function DesktopCheckout({ s }: { s: CheckoutState }): JSX.Element {
  if (s.cartLoading || !s.cart) {
    return (
      <main className="mx-auto grid max-w-screen-xl gap-8 px-6 py-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
        </div>
        <Skeleton className="h-80" />
      </main>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void s.submit();
      }}
      className="mx-auto grid max-w-screen-xl gap-8 px-6 py-8 lg:grid-cols-[1fr_400px]"
    >
      {/* ============== LEFT: All sections ============== */}
      <div className="min-w-0 space-y-5">
        <div className="flex items-center gap-3">
          <Link
            href="/cart"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-bold text-ink-900">ชำระเงิน</h1>
        </div>

        <ItemsSection s={s} />
        <AddressSection s={s} />
        <CouponLoyaltySection s={s} />
        <CarrierSection s={s} />
        <PaymentSection s={s} />

        <ReferralBadge s={s} />
      </div>

      {/* ============== RIGHT: Sticky summary ============== */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          <h2 className="text-base font-bold text-ink-900">สรุปยอด</h2>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between text-ink-600">
              <dt>ยอดสินค้า ({s.cart.items.length} รายการ)</dt>
              <dd className="tabular-nums">{formatTHB(s.cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-ink-600">
              <dt>ค่าจัดส่ง</dt>
              <dd className="tabular-nums">
                {s.shippingCents === 0 ? (
                  <span className="text-emerald-600">ฟรี</span>
                ) : (
                  formatTHB(s.shippingCents)
                )}
              </dd>
            </div>
            {s.couponDiscountCents > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>คูปอง</dt>
                <dd className="tabular-nums">−{formatTHB(s.couponDiscountCents)}</dd>
              </div>
            )}
            {s.loyaltyDiscountCents > 0 && (
              <div className="flex justify-between text-amber-700">
                <dt>แต้มสะสม ({s.redeemPoints} แต้ม)</dt>
                <dd className="tabular-nums">−{formatTHB(s.loyaltyDiscountCents)}</dd>
              </div>
            )}

            <div className="border-t border-dashed border-ink-100 pt-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-sm font-bold text-ink-900">รวมทั้งสิ้น</dt>
                <dd className="text-2xl font-extrabold tabular-nums tracking-tight text-brand">
                  {formatTHB(s.totalCents)}
                </dd>
              </div>
            </div>
          </dl>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={s.submitLoading}
            rightIcon={!s.submitLoading ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
          >
            ยืนยันชำระเงิน
          </Button>

          {s.submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">{s.submitError}</p>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3">
            <ShieldCheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-xs leading-relaxed text-emerald-900">
              <strong>NP Protect</strong> — เงินถูกพักจนกว่าคุณกดยืนยันรับสินค้า
            </p>
          </div>

          <p className="text-center text-[11px] text-ink-400">
            กดยืนยันเพื่อสร้างคำสั่งซื้อและไปขั้นชำระเงิน
          </p>
        </div>
      </aside>
    </form>
  );
}
