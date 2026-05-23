'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import type { Carrier } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { formatDate, formatTHB } from '@/lib/format';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  PackageIcon,
  TruckIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<
  string,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'info',
  READY_TO_SHIP: 'brand',
  SHIPPED: 'info',
  DELIVERED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'neutral',
};

const STATUS_TH: Record<string, string> = {
  PENDING_PAYMENT: 'รอชำระ',
  PAID: 'ชำระแล้ว',
  READY_TO_SHIP: 'พร้อมส่ง',
  SHIPPED: 'จัดส่งแล้ว',
  DELIVERED: 'ถึงปลายทาง',
  COMPLETED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก',
  REFUNDED: 'คืนเงิน',
};

export default function MerchantOrdersPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [shipModalOrderId, setShipModalOrderId] = useState<string | null>(null);

  const { data: shops } = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.mine(token);
    },
    enabled: Boolean(token),
  });
  const shop = shops?.[0];

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', 'shop', shop?.id],
    queryFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.orders.byShop(token, shop.id);
    },
    enabled: Boolean(token && shop),
  });

  if (!shop) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ออเดอร์ของร้าน</h1>
        <EmptyState
          icon={<PackageIcon />}
          title="ยังไม่มีร้าน"
          description="สร้างร้านก่อนเพื่อรับออเดอร์"
          action={
            <Link
              href="/merchant/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              ไปแดชบอร์ด
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="pb-28">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/merchant/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
            ออเดอร์ของร้าน
          </h1>
        </div>
      </header>

      <div className="container-mobile pt-4">
        {isLoading || !orders ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<PackageIcon />}
            title="ยังไม่มีออเดอร์"
            description="ออเดอร์จะปรากฏที่นี่เมื่อมีลูกค้าสั่งซื้อ"
          />
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card"
              >
                <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>
                      {STATUS_TH[order.status] ?? order.status}
                    </Badge>
                    <span className="text-[11px] text-ink-500">#{order.id.slice(0, 8)}</span>
                  </div>
                  <span className="text-[11px] text-ink-400">{formatDate(order.createdAt)}</span>
                </div>
                <ul className="divide-y divide-ink-100">
                  {order.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="line-clamp-1 text-ink-700">
                        {i.productName}{' '}
                        <span className="text-ink-400">× {i.quantity}</span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-ink-900">
                        {formatTHB(i.subtotalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2 px-4 py-3">
                  <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                      ที่อยู่จัดส่ง
                    </p>
                    <p className="text-xs text-ink-700">
                      {order.shippingAddress.fullName} · {order.shippingAddress.phone}
                      <br />
                      {order.shippingAddress.line1}, {order.shippingAddress.province}{' '}
                      {order.shippingAddress.postalCode}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-400">รวม</p>
                      <span className="text-base font-bold tracking-tight text-brand">
                        {formatTHB(order.totalCents)}
                      </span>
                    </div>
                    {order.status === 'PAID' ? (
                      <Button
                        size="sm"
                        onClick={() => setShipModalOrderId(order.id)}
                        leftIcon={<TruckIcon className="h-4 w-4" />}
                      >
                        จัดส่ง
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {shipModalOrderId ? (
        <ShipModal
          orderId={shipModalOrderId}
          onClose={() => setShipModalOrderId(null)}
          onShipped={() => {
            setShipModalOrderId(null);
            void qc.invalidateQueries({ queryKey: ['orders', 'shop', shop.id] });
          }}
        />
      ) : null}
    </main>
  );
}

function ShipModal({
  orderId,
  onClose,
  onShipped,
}: {
  orderId: string;
  onClose: () => void;
  onShipped: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [carrierCode, setCarrierCode] = useState<string | null>(null);
  const [trackingNo, setTrackingNo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: () => api.carriers.list(),
  });

  async function submit(): Promise<void> {
    if (!token || !carrierCode || trackingNo.trim().length < 3) {
      setErr('กรุณาเลือกผู้จัดส่งและกรอกหมายเลขพัสดุ');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await api.orders.ship(token, orderId, { carrierCode, trackingNo: trackingNo.trim() });
      onShipped();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'จัดส่งไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40 backdrop-blur-sm">
      <div className="w-full rounded-t-3xl bg-white p-5 shadow-pop">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">ทำเครื่องหมายว่าจัดส่ง</h3>
            <p className="text-xs text-ink-500">เลือกขนส่งและกรอกหมายเลขพัสดุ</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-ink-400" aria-label="ปิด">
            ×
          </button>
        </div>

        <p className="mb-2 text-xs font-medium text-ink-700">ผู้จัดส่ง</p>
        <div className="grid grid-cols-2 gap-2">
          {(carriers ?? []).map((c) => (
            <CarrierMini
              key={c.id}
              carrier={c}
              active={c.code === carrierCode}
              onClick={() => setCarrierCode(c.code)}
            />
          ))}
        </div>

        <div className="mt-3">
          <Input
            label="หมายเลขพัสดุ"
            value={trackingNo}
            onChange={(e) => setTrackingNo(e.target.value)}
            placeholder="เช่น TH123456789"
            required
          />
        </div>

        {err ? <p className="mt-2 text-xs font-medium text-red-600">{err}</p> : null}

        <Button
          fullWidth
          className="mt-4"
          onClick={submit}
          loading={loading}
          leftIcon={<TruckIcon className="h-4 w-4" />}
        >
          ยืนยันจัดส่ง
        </Button>
      </div>
    </div>
  );
}

function CarrierMini({
  carrier,
  active,
  onClick,
}: {
  carrier: Carrier;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-2xl border p-2.5 text-left transition active:scale-[0.99]',
        active ? 'border-brand bg-brand-50 shadow-glow' : 'border-ink-100 bg-white',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-xl',
          active ? 'bg-brand text-white' : 'bg-ink-50 text-ink-700',
        )}
      >
        <TruckIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink-900">{carrier.name}</p>
        <p className="text-[10px] text-ink-500">{carrier.etaText ?? 'ETA ไม่ระบุ'}</p>
      </div>
    </button>
  );
}
