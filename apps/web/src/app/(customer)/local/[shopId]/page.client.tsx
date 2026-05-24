'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronLeftIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  PlusIcon,
  StoreIcon,
  TruckIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const KIND_LABEL: Record<string, string> = {
  RESTAURANT: 'ร้านอาหาร',
  CAFE: 'คาเฟ่',
  GROCERY: 'ของชำ',
  FRESH_MARKET: 'ของสด',
  LOCAL_GOODS: 'ของฝาก',
  SERVICE: 'บริการ',
};

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function dayOfWeek(dayKey: keyof Required<{
  mon: unknown;
  tue: unknown;
  wed: unknown;
  thu: unknown;
  fri: unknown;
  sat: unknown;
  sun: unknown;
}>): string {
  return { mon: 'จ', tue: 'อ', wed: 'พ', thu: 'พฤ', fri: 'ศ', sat: 'ส', sun: 'อา' }[dayKey];
}

export default function LocalStorePage(): JSX.Element {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'menu' | 'slots' | 'info'>('menu');
  const [slotKind, setSlotKind] = useState<'PICKUP' | 'DELIVERY'>('DELIVERY');

  const { data: store, isLoading: loadingStore } = useQuery({
    queryKey: ['local', 'store', shopId],
    queryFn: () => api.local.getStore(shopId),
  });
  const { data: menu, isLoading: loadingMenu } = useQuery({
    queryKey: ['local', 'menu', shopId],
    queryFn: () => api.local.menu(shopId),
  });
  const { data: slots } = useQuery({
    queryKey: ['local', 'slots', shopId, slotKind],
    queryFn: () => api.local.slots(shopId, slotKind),
  });

  const addToCart = useMutation({
    mutationFn: (productId: string) =>
      api.cart.add(token!, { productId, quantity: 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (loadingStore) {
    return (
      <main className="container-mobile py-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
      </main>
    );
  }
  if (!store) {
    return (
      <main className="container-mobile py-6">
        <EmptyState
          icon={<StoreIcon />}
          title="ไม่พบร้านนี้"
          description="อาจถูกปิดหรือยังไม่เปิดใช้งาน"
        />
      </main>
    );
  }

  const hoursEntries = (
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
  ).map((day) => ({
    day,
    ranges: store.openHours?.[day] ?? [],
  }));

  return (
    <main className="relative min-h-dvh pb-32">
      {/* Cover gradient */}
      <div className="relative h-44 overflow-hidden">
        <div className="absolute inset-0 bg-mesh-2" aria-hidden />
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/20 blur-3xl" />
        <div className="container-mobile relative flex h-full items-end pb-4">
          <Link
            href="/local"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-800 shadow-card backdrop-blur"
            style={{ marginTop: 'env(safe-area-inset-top)' }}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="container-mobile relative -mt-14">
        <div className="rounded-3xl bg-white/95 p-5 shadow-pop ring-1 ring-ink-100 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
            {KIND_LABEL[store.kind] ?? store.kind}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">
            {store.shopName ?? 'ร้านท้องถิ่น'}
          </h1>
          <div className="mt-2 flex items-start gap-1 text-[12px] text-ink-600">
            <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{store.addressText}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {store.deliveryEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand">
                <TruckIcon className="h-3 w-3" />
                ส่งใน {store.deliveryRadiusKm} กม. · {formatBaht(store.baseDeliveryCents)}
              </span>
            ) : null}
            {store.pickupEnabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-700">
                <StoreIcon className="h-3 w-3" />
                รับเอง
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-700">
              <ClockIcon className="h-3 w-3" />
              เตรียม {store.prepTimeMinutes} นาที
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white/85 p-1.5 ring-1 ring-ink-100 backdrop-blur">
          {[
            { id: 'menu', label: 'เมนู' },
            { id: 'slots', label: 'จองเวลา' },
            { id: 'info', label: 'รายละเอียด' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={cn(
                'rounded-xl px-3 py-2 text-xs font-semibold transition',
                activeTab === t.id
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'text-ink-600',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Menu tab */}
        {activeTab === 'menu' ? (
          <div className="mt-4 space-y-6">
            {loadingMenu ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : null}
            {menu && menu.length === 0 ? (
              <EmptyState
                icon={<StoreIcon />}
                title="ยังไม่มีเมนู"
                description="ร้านยังไม่ลงรายการสินค้า"
              />
            ) : null}
            {menu?.map((group, idx) => (
              <section key={group.category?.id ?? `unsorted-${idx}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
                    {group.category?.name ?? 'สินค้าทั้งหมด'}
                  </h2>
                  <span className="text-[11px] text-ink-400">
                    {group.items.length} รายการ
                  </span>
                </div>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100">
                        {item.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.mediaUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl">
                            🍽
                          </div>
                        )}
                      </div>
                      <div className="flex-1 leading-tight">
                        <p className="font-display text-sm font-bold tracking-tight text-ink-900">
                          {item.name}
                        </p>
                        {item.description ? (
                          <p className="line-clamp-2 text-[11px] text-ink-500">
                            {item.description}
                          </p>
                        ) : null}
                        <p className="mt-1 font-display text-sm font-bold text-brand">
                          {formatBaht(item.priceCents)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!token || addToCart.isPending}
                        onClick={() => addToCart.mutate(item.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow disabled:opacity-50"
                      >
                        <PlusIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!token ? (
              <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-[12px] text-amber-800 ring-1 ring-amber-200">
                เข้าสู่ระบบเพื่อสั่งซื้อ —{' '}
                <Link href="/login" className="font-semibold underline">
                  ล็อกอิน
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Slots tab */}
        {activeTab === 'slots' ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/85 p-1.5 ring-1 ring-ink-100 backdrop-blur">
              {(['DELIVERY', 'PICKUP'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSlotKind(k)}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs font-semibold transition',
                    slotKind === k
                      ? 'bg-brand-gradient text-white shadow-glow'
                      : 'text-ink-600',
                  )}
                >
                  {k === 'DELIVERY' ? '🛵 ส่งให้' : '🛍 รับเอง'}
                </button>
              ))}
            </div>

            {slots && slots.length === 0 ? (
              <EmptyState
                icon={<ClockIcon />}
                title="ยังไม่มีช่วงเวลา"
                description="ร้านยังไม่เปิดให้จอง"
              />
            ) : null}
            <div className="space-y-2">
              {slots?.map((s) => {
                const starts = new Date(s.startsAt);
                const ends = new Date(s.endsAt);
                const full = s.available <= 0;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center justify-between rounded-2xl border bg-white/95 p-3 backdrop-blur',
                      full
                        ? 'border-ink-100 opacity-50'
                        : 'border-ink-100 shadow-card',
                    )}
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                        {starts.toLocaleDateString('th-TH', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                      <p className="font-display text-base font-bold tracking-tight text-ink-900">
                        {starts.toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {ends.toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-3 py-1 text-[11px] font-semibold',
                        full ? 'bg-ink-100 text-ink-500' : 'bg-brand-50 text-brand',
                      )}
                    >
                      {full ? 'เต็ม' : `เหลือ ${s.available}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Info tab */}
        {activeTab === 'info' ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                เวลาทำการ
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                {hoursEntries.map(({ day, ranges }) => (
                  <div
                    key={day}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="w-8 font-semibold text-ink-700">
                      {dayOfWeek(day)}
                    </span>
                    <span className="text-ink-600">
                      {ranges.length === 0
                        ? 'ปิด'
                        : ranges.map((r) => `${r.open}–${r.close}`).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                ตำแหน่ง
              </p>
              <p className="mt-1 font-display text-sm font-semibold text-ink-900">
                {store.lat.toFixed(5)}, {store.lng.toFixed(5)}
              </p>
              <p className="text-[12px] text-ink-600">{store.addressText}</p>
              <a
                href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand"
              >
                <NavigationIcon className="h-3 w-3" />
                ดูเส้นทาง
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
