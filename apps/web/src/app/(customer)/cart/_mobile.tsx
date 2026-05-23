'use client';

/**
 * Phase 14.4 — `/cart` MOBILE variant.
 * Vertical list + fixed bottom CTA bar (the original layout).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatTHB } from '@/lib/format';
import {
  ArrowRightIcon,
  BagIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';

const SHIPPING_CENTS = 5000;

export function MobileCart(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.cart.get(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const updateItem = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.cart.update(token, id, quantity);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (!token) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ตะกร้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="กรุณาเข้าสู่ระบบ"
          description="เพื่อบันทึกตะกร้าและสั่งซื้อสินค้า"
          action={
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ตะกร้า</h1>
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </main>
    );
  }

  if (data.items.length === 0) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ตะกร้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="ตะกร้าว่างเปล่า"
          description="ลองเลือกสินค้าจากหน้าฟีดดูครับ"
          action={
            <Link
              href="/feed"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เลือกสินค้า
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  const totalCents = data.subtotalCents + SHIPPING_CENTS;

  return (
    <main className="container-mobile py-6 pb-40">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-ink-900">ตะกร้า</h1>
        <span className="text-sm text-ink-500">{data.items.length} รายการ</span>
      </div>

      <ul className="space-y-3">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card"
          >
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-ink-100">
              {item.mediaUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.mediaUrl}
                  alt={item.productName}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <p className="line-clamp-2 text-sm font-medium text-ink-900">
                  {item.productName}
                </p>
                <p className="mt-0.5 text-[15px] font-bold tracking-tight text-brand">
                  {formatTHB(item.unitPriceCents)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                {item.quantity === 1 ? (
                  <button
                    onClick={() => updateItem.mutate({ id: item.id, quantity: 0 })}
                    className="flex h-8 items-center gap-1 rounded-full bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 active:scale-95"
                    aria-label="ลบ"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    ลบ
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1 rounded-full border border-ink-100">
                  <button
                    onClick={() =>
                      updateItem.mutate({ id: item.id, quantity: item.quantity - 1 })
                    }
                    className="flex h-8 w-8 items-center justify-center text-ink-700 active:bg-ink-50"
                    aria-label="ลด"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() =>
                      updateItem.mutate({ id: item.id, quantity: item.quantity + 1 })
                    }
                    className="flex h-8 w-8 items-center justify-center text-ink-700 active:bg-ink-50"
                    aria-label="เพิ่ม"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-5 rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink-900">สรุปยอด</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between text-ink-600">
            <dt>ยอดสินค้า</dt>
            <dd className="tabular-nums">{formatTHB(data.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-ink-600">
            <dt>ค่าจัดส่ง (ประมาณ)</dt>
            <dd className="tabular-nums">{formatTHB(SHIPPING_CENTS)}</dd>
          </div>
          <div className="my-2 border-t border-dashed border-ink-100" />
          <div className="flex justify-between text-ink-900">
            <dt className="font-semibold">รวมทั้งหมด</dt>
            <dd className="text-base font-bold tabular-nums text-brand">
              {formatTHB(totalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <div
        className="glass-strong fixed inset-x-0 bottom-16 z-20 border-t border-white/40"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="container-mobile flex items-center justify-between gap-3 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-400">ยอดสุทธิ</p>
            <p className="text-lg font-bold tracking-tight text-ink-900">
              {formatTHB(totalCents)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => router.push('/checkout')}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
          >
            ไปชำระเงิน
          </Button>
        </div>
      </div>
    </main>
  );
}
