'use client';

/**
 * Phase 14.4 — Checkout sections (shared by mobile + desktop).
 *
 * Each section is a self-contained card that reads from the central
 * `CheckoutState` returned by `useCheckoutState()`. Layouts compose
 * these sections in different orders/columns; the sections themselves
 * are layout-agnostic — they fill the width they're given.
 */

import type { Carrier } from '@np/types';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTHB } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  ClockIcon,
  GiftIcon,
  LinkIcon,
  MapPinIcon,
  NavigationIcon,
  QrIcon,
  StarIcon,
  TicketIcon,
  TruckIcon,
} from '@/components/icons';
import type { CheckoutState } from './_state';

export function ItemsSection({ s }: { s: CheckoutState }): JSX.Element {
  if (!s.cart) return <Skeleton className="h-40 rounded-2xl" />;
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:p-5">
      <h2 className="text-sm font-semibold text-ink-900">รายการสินค้า</h2>
      <ul className="mt-3 space-y-2">
        {s.cart.items.map((i) => (
          <li key={i.id} className="flex gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ink-100 lg:h-14 lg:w-14">
              {i.mediaUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={i.mediaUrl}
                  alt={i.productName}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-1 items-start justify-between gap-3">
              <div>
                <p className="line-clamp-2 text-sm text-ink-900">{i.productName}</p>
                <p className="text-xs text-ink-500">× {i.quantity}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-ink-900">
                {formatTHB(i.unitPriceCents * i.quantity)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AddressSection({ s }: { s: CheckoutState }): JSX.Element {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPinIcon className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink-900">ที่อยู่จัดส่ง</h2>
      </div>
      <div className="space-y-3">
        <Input
          label="ชื่อ-นามสกุล"
          value={s.address.fullName}
          onChange={(e) => s.setAddress({ ...s.address, fullName: e.target.value })}
          required
        />
        <Input
          label="เบอร์โทรศัพท์"
          value={s.address.phone}
          onChange={(e) => s.setAddress({ ...s.address, phone: e.target.value })}
          inputMode="tel"
          placeholder="0xx-xxx-xxxx"
          required
        />
        <Input
          label="ที่อยู่"
          value={s.address.line1}
          onChange={(e) => s.setAddress({ ...s.address, line1: e.target.value })}
          placeholder="บ้านเลขที่ ถนน แขวง/ตำบล อำเภอ"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="จังหวัด"
            value={s.address.province}
            onChange={(e) => s.setAddress({ ...s.address, province: e.target.value })}
            required
          />
          <Input
            label="รหัสไปรษณีย์"
            value={s.address.postalCode}
            onChange={(e) =>
              s.setAddress({ ...s.address, postalCode: e.target.value })
            }
            inputMode="numeric"
            pattern="\d{5}"
            required
          />
        </div>
        {s.selectedCarrier?.kind === 'EXPRESS_LOCAL' && (
          <div className="flex items-center justify-between rounded-2xl bg-brand-50 px-3 py-2 ring-1 ring-brand-100">
            <div>
              <p className="text-[11px] font-semibold text-brand">
                ส่งด่วนต้องระบุพิกัด
              </p>
              <p className="text-[10px] text-ink-500">
                {s.address.lat != null && s.address.lng != null
                  ? `${s.address.lat.toFixed(4)}, ${s.address.lng.toFixed(4)}`
                  : 'ยังไม่ได้ตั้งตำแหน่ง'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition((p) =>
                  s.setAddress((a) => ({
                    ...a,
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                  })),
                );
              }}
              className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-[11px] font-semibold text-white shadow-glow"
            >
              <NavigationIcon className="h-3 w-3" />
              ใช้ตำแหน่งฉัน
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function CouponLoyaltySection({ s }: { s: CheckoutState }): JSX.Element {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:p-5">
      <div className="mb-3 flex items-center gap-2">
        <TicketIcon className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink-900">ส่วนลด</h2>
      </div>

      {s.appliedCoupon ? (
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
          <div className="flex items-center gap-2">
            <GiftIcon className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-[11px] font-semibold text-emerald-700">
                ใช้ {s.appliedCoupon.code}
              </p>
              <p className="text-[10px] text-emerald-700/80">
                {s.appliedCoupon.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={s.removeCoupon}
            className="text-[11px] font-semibold text-emerald-700 underline"
          >
            เอาออก
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={s.couponInput}
              onChange={(e) => s.setCouponInput(e.target.value.toUpperCase())}
              placeholder="ใส่โค้ดส่วนลด"
              className="flex-1 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm font-mono uppercase tracking-wider outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => void s.applyCoupon()}
              disabled={!s.couponInput.trim()}
              className="rounded-2xl bg-brand-gradient px-4 text-xs font-semibold text-white shadow-glow disabled:opacity-50"
            >
              ใช้
            </button>
          </div>
          <button
            type="button"
            onClick={s.toggleAvailableCoupons}
            className="text-[11px] font-semibold text-brand underline"
          >
            {s.showAvailableCoupons ? 'ซ่อน' : 'ดูโค้ดที่มี'}
          </button>
          {s.showAvailableCoupons && s.availableCouponsData && (
            <div className="flex flex-wrap gap-1.5">
              {s.availableCouponsData.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    s.setCouponInput(c.code);
                    setTimeout(() => void s.applyCoupon(), 0);
                  }}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand-100"
                >
                  {c.code}
                </button>
              ))}
            </div>
          )}
          {s.couponError && (
            <p className="text-[11px] text-rose-500">{s.couponError}</p>
          )}
        </div>
      )}

      {s.loyaltyData && s.loyaltyData.points > 0 && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StarIcon className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-[11px] font-semibold text-amber-800">
                  ใช้แต้มแลกส่วนลด
                </p>
                <p className="text-[10px] text-amber-700/80">
                  คุณมี {s.loyaltyData.points.toLocaleString()} แต้ม (1 แต้ม = 1 บาท)
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-700">
              {s.redeemPoints > 0 ? `-฿${s.redeemPoints}` : ''}
            </span>
          </div>
          {s.maxRedeemablePoints > 0 && (
            <input
              type="range"
              min={0}
              max={s.maxRedeemablePoints}
              step={10}
              value={s.redeemPoints}
              onChange={(e) => s.setRedeemPoints(Number(e.target.value))}
              className="mt-2 w-full accent-amber-500"
            />
          )}
        </div>
      )}
    </section>
  );
}

export function CarrierSection({ s }: { s: CheckoutState }): JSX.Element {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TruckIcon className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink-900">ผู้จัดส่ง</h2>
        </div>
        <span className="text-[11px] text-ink-500">ฟรีค่าส่งเมื่อซื้อครบ ฿1,000</span>
      </div>
      {!s.carriers ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
          {s.carriers.map((c) => (
            <CarrierOption
              key={c.id}
              carrier={c}
              active={c.code === s.carrierCode}
              onClick={() => s.setCarrierCode(c.code)}
              finalCost={
                c.kind === 'PARCEL' && s.cart && s.cart.subtotalCents >= 100_000
                  ? 0
                  : c.baseRateCents
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function PaymentSection({ s }: { s: CheckoutState }): JSX.Element {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card lg:p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink-900">วิธีชำระเงิน</h2>
      <div className="space-y-2 lg:grid lg:grid-cols-3 lg:gap-2 lg:space-y-0">
        <PaymentOption
          active={s.method === 'PROMPTPAY'}
          onClick={() => s.setMethod('PROMPTPAY')}
          icon={<QrIcon className="h-5 w-5" />}
          title="พร้อมเพย์ (QR)"
          desc="สแกนจ่ายผ่านแอปธนาคาร · แนะนำ"
          tag="Recommended"
        />
        <PaymentOption
          active={s.method === 'CARD'}
          onClick={() => s.setMethod('CARD')}
          icon={
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
          }
          title="บัตรเครดิต / เดบิต"
          desc="Visa, Mastercard, JCB"
        />
        <PaymentOption
          active={s.method === 'COD'}
          onClick={() => s.setMethod('COD')}
          icon={<TruckIcon className="h-5 w-5" />}
          title="เก็บเงินปลายทาง"
          desc="จ่ายเงินสดเมื่อรับของ"
        />
      </div>
    </section>
  );
}

export function ReferralBadge({ s }: { s: CheckoutState }): JSX.Element | null {
  if (!s.refCode || !s.refResolveData) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand-50/60 p-3">
      <LinkIcon className="h-5 w-5 shrink-0 text-brand" />
      <div className="flex-1">
        <p className="text-xs text-ink-900">
          ผ่านลิงก์ของ{' '}
          <strong className="text-brand">
            {s.refResolveData.creator.displayName}
          </strong>
        </p>
        <p className="text-[11px] text-ink-500">
          Creator จะได้รับคอมมิชชั่นเมื่อออเดอร์ปิดสำเร็จ
        </p>
      </div>
      <button
        type="button"
        onClick={s.clearRef}
        className="text-[11px] font-semibold text-ink-500 underline"
      >
        ลบ
      </button>
    </div>
  );
}

// ---------- atoms -----------------------------------------------------------

function CarrierOption({
  carrier,
  active,
  onClick,
  finalCost,
}: {
  carrier: Carrier;
  active: boolean;
  onClick: () => void;
  finalCost: number;
}): JSX.Element {
  const isExpress = carrier.kind === 'EXPRESS_LOCAL';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]',
        active ? 'border-brand bg-brand-50 shadow-glow' : 'border-ink-100 bg-white',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          active ? 'bg-brand text-white' : 'bg-ink-50 text-ink-700',
        )}
      >
        <TruckIcon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink-900">{carrier.name}</p>
          {isExpress && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
              Express
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
          <ClockIcon className="h-3 w-3" />
          <span>{carrier.etaText ?? 'ETA ไม่ระบุ'}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-ink-900">
          {finalCost === 0 ? 'ฟรี' : formatTHB(finalCost)}
        </p>
      </div>
    </button>
  );
}

function PaymentOption({
  active,
  onClick,
  icon,
  title,
  desc,
  tag,
}: {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  title: string;
  desc: string;
  tag?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]',
        active ? 'border-brand bg-brand-50 shadow-glow' : 'border-ink-100 bg-white',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          active ? 'bg-brand text-white' : 'bg-ink-50 text-ink-700',
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          {tag && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              {tag}
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-500">{desc}</p>
      </div>
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full border-2',
          active ? 'border-brand bg-brand' : 'border-ink-300',
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}
