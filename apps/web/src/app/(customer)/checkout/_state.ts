'use client';

/**
 * Phase 14.4 — Checkout shared state.
 *
 * Both `_mobile.tsx` and `_desktop.tsx` consume `useCheckoutState()`. The
 * idea: form data, queries, derived totals, submit handler all live here
 * once; each layout just decides where to put the address card vs. the
 * summary box. React state is co-located inside one hook to make it easy
 * to add fields without touching either layout.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Address, Carrier } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { clearRefCode, getRefCode } from '@/lib/affiliate';
import { tracker } from '@/lib/track';

export type PaymentMethod = 'PROMPTPAY' | 'CARD' | 'COD';

export interface AppliedCoupon {
  code: string;
  discountCents: number;
  freeShipping: boolean;
  message: string;
}

export interface CheckoutState {
  // Form state
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  carrierCode: string | null;
  setCarrierCode: (c: string | null) => void;
  address: Address;
  setAddress: React.Dispatch<React.SetStateAction<Address>>;

  // Coupon
  couponInput: string;
  setCouponInput: (s: string) => void;
  appliedCoupon: AppliedCoupon | null;
  removeCoupon: () => void;
  applyCoupon: () => Promise<void>;
  couponError: string | null;
  showAvailableCoupons: boolean;
  toggleAvailableCoupons: () => void;
  availableCouponsData: Awaited<ReturnType<typeof api.coupons.available>> | undefined;

  // Loyalty
  redeemPoints: number;
  setRedeemPoints: (n: number) => void;
  loyaltyData: Awaited<ReturnType<typeof api.loyalty.me>> | undefined;
  maxRedeemablePoints: number;

  // Referral
  refCode: string | null;
  clearRef: () => void;
  refResolveData: Awaited<ReturnType<typeof api.creators.resolveLink>> | undefined;

  // Cart + carriers
  cart: Awaited<ReturnType<typeof api.cart.get>> | undefined;
  cartLoading: boolean;
  carriers: Carrier[] | undefined;
  selectedCarrier: Carrier | null;

  // Pricing
  baseShippingCents: number;
  shippingCents: number;
  couponDiscountCents: number;
  loyaltyDiscountCents: number;
  totalDiscountCents: number;
  totalCents: number;

  // Submit
  submit: () => Promise<void>;
  submitLoading: boolean;
  submitError: string | null;
}

export function useCheckoutState(): CheckoutState {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const [method, setMethod] = useState<PaymentMethod>('PROMPTPAY');
  const [carrierCode, setCarrierCode] = useState<string | null>(null);
  const [address, setAddress] = useState<Address>({
    fullName: '',
    phone: '',
    line1: '',
    province: '',
    postalCode: '',
  });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [refCode, setRefCodeState] = useState<string | null>(null);
  useEffect(() => {
    setRefCodeState(getRefCode());
  }, []);

  // ----- Coupon ------------------------------------------------------------
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [showAvailableCoupons, setShowAvailableCoupons] = useState(false);

  const availableCouponsQ = useQuery({
    queryKey: ['coupons', 'available'],
    queryFn: () => api.coupons.available(),
    enabled: showAvailableCoupons,
  });

  // ----- Loyalty -----------------------------------------------------------
  const [redeemPoints, setRedeemPoints] = useState(0);
  const loyaltyQ = useQuery({
    queryKey: ['loyalty', 'me'],
    queryFn: () => api.loyalty.me(token!),
    enabled: !!token,
  });

  // ----- Referral ----------------------------------------------------------
  const refResolveQ = useQuery({
    queryKey: ['ref-resolve', refCode],
    queryFn: () => api.creators.resolveLink(refCode!),
    enabled: Boolean(refCode),
    retry: false,
  });

  // ----- Cart + carriers ---------------------------------------------------
  const cartQ = useQuery({
    queryKey: ['cart'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.cart.get(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const carriersQ = useQuery({
    queryKey: ['carriers'],
    queryFn: () => api.carriers.list(),
  });

  // Default to cheapest PARCEL carrier on first load.
  useEffect(() => {
    if (!carrierCode && carriersQ.data && carriersQ.data.length > 0) {
      const parcel = carriersQ.data.filter((c) => c.kind === 'PARCEL');
      const sorted = (parcel.length ? parcel : carriersQ.data)
        .slice()
        .sort((a, b) => a.baseRateCents - b.baseRateCents);
      setCarrierCode(sorted[0]?.code ?? null);
    }
  }, [carriersQ.data, carrierCode]);

  const selectedCarrier = useMemo<Carrier | null>(
    () => carriersQ.data?.find((c) => c.code === carrierCode) ?? null,
    [carriersQ.data, carrierCode],
  );

  // ----- Pricing -----------------------------------------------------------
  const baseShippingCents = useMemo(() => {
    if (!selectedCarrier || !cartQ.data) return 0;
    const subtotal = cartQ.data.subtotalCents;
    // Free shipping over ฿1,000 only applies to parcel (express stays paid).
    if (selectedCarrier.kind === 'PARCEL' && subtotal >= 100_000) return 0;
    return selectedCarrier.baseRateCents;
  }, [selectedCarrier, cartQ.data]);

  const shippingCents = appliedCoupon?.freeShipping ? 0 : baseShippingCents;
  const couponDiscountCents = appliedCoupon?.freeShipping
    ? 0
    : appliedCoupon?.discountCents ?? 0;
  const loyaltyDiscountCents = redeemPoints * 100;
  const totalDiscountCents = couponDiscountCents + loyaltyDiscountCents;

  const maxRedeemablePoints = Math.min(
    loyaltyQ.data?.points ?? 0,
    cartQ.data
      ? Math.floor((cartQ.data.subtotalCents - couponDiscountCents) / 100)
      : 0,
  );

  const totalCents = cartQ.data
    ? Math.max(0, cartQ.data.subtotalCents - totalDiscountCents) + shippingCents
    : 0;

  // ----- Mutations ---------------------------------------------------------
  async function applyCoupon(): Promise<void> {
    if (!token || !cartQ.data || !couponInput.trim()) return;
    setCouponError(null);
    try {
      const quote = await api.coupons.quote(token, {
        code: couponInput.trim().toUpperCase(),
        subtotalCents: cartQ.data.subtotalCents,
        shippingCents: baseShippingCents,
      });
      setAppliedCoupon({
        code: quote.code,
        discountCents: quote.discountCents,
        freeShipping: quote.freeShipping,
        message: quote.message,
      });
    } catch (err) {
      setCouponError(err instanceof ApiError ? err.message : 'ใช้คูปองไม่ได้');
      setAppliedCoupon(null);
    }
  }

  async function submit(): Promise<void> {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!carrierCode) {
      setSubmitError('กรุณาเลือกผู้จัดส่ง');
      return;
    }
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      const orders = await api.checkout.create(token, {
        shippingAddress: address,
        carrierCode,
        affiliateCode: refCode ?? undefined,
        couponCode: appliedCoupon?.code,
        redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
      });
      const first = orders[0];
      if (!first) throw new Error('สร้างคำสั่งซื้อไม่สำเร็จ');
      await api.payments.create(token, { orderId: first.id, method });
      for (const o of orders) {
        tracker.track('purchase', {
          entityType: 'order',
          entityId: o.id,
          surface: 'checkout',
          meta: {
            totalCents: o.totalCents,
            itemCount: o.items?.length ?? 0,
            method,
          },
        });
      }
      if (refCode) clearRefCode();
      router.push(`/orders/${first.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'ชำระเงินไม่สำเร็จ');
    } finally {
      setSubmitLoading(false);
    }
  }

  return {
    method,
    setMethod,
    carrierCode,
    setCarrierCode,
    address,
    setAddress,

    couponInput,
    setCouponInput,
    appliedCoupon,
    removeCoupon: () => {
      setAppliedCoupon(null);
      setCouponInput('');
    },
    applyCoupon,
    couponError,
    showAvailableCoupons,
    toggleAvailableCoupons: () => setShowAvailableCoupons((v) => !v),
    availableCouponsData: availableCouponsQ.data,

    redeemPoints,
    setRedeemPoints,
    loyaltyData: loyaltyQ.data,
    maxRedeemablePoints,

    refCode,
    clearRef: () => {
      clearRefCode();
      setRefCodeState(null);
    },
    refResolveData: refResolveQ.data,

    cart: cartQ.data,
    cartLoading: cartQ.isLoading,
    carriers: carriersQ.data,
    selectedCarrier,

    baseShippingCents,
    shippingCents,
    couponDiscountCents,
    loyaltyDiscountCents,
    totalDiscountCents,
    totalCents,

    submit,
    submitLoading,
    submitError,
  };
}
