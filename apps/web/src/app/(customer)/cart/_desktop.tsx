'use client';

/**
 * Phase 14.4 — `/cart` DESKTOP variant.
 *
 *   ┌──────────────────────────────────┬──────────────────────────┐
 *   │  ตะกร้า (3 รายการ)               │  สรุปยอด                  │
 *   │                                  │  ───────────             │
 *   │  ┌───────────────────────────┐   │  ยอดสินค้า       ฿1,290  │
 *   │  │ [img]  Product name       │   │  ค่าจัดส่ง       ฿50     │
 *   │  │        ฿590    [- 1 +]    │   │  ลูกค้าใช้จ่าย   ฿1,340  │  sticky
 *   │  │                            │   │                          │
 *   │  └───────────────────────────┘   │  [ ไปชำระเงิน → ]        │
 *   │                                  │                          │
 *   │  ┌───────────────────────────┐   │  ✓ คุ้มครอง NP Protect   │
 *   │  │ ...                       │   │                          │
 *   │  └───────────────────────────┘   │                          │
 *   └──────────────────────────────────┴──────────────────────────┘
 *
 * Why a sidebar instead of bottom CTA?
 *  - Desktop has no "below the fold" — the summary box should always be
 *    visible without scrolling, which is what `lg:sticky lg:top-20` does.
 *  - Bigger product rows (96px thumb instead of 80px) since horizontal
 *    space is no longer scarce — easier to identify each item at a glance.
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
  ShieldCheckIcon,
  TrashIcon,
  TruckIcon,
} from '@/components/icons';

const SHIPPING_CENTS = 5000;

export function DesktopCart(): JSX.Element {
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
      <main className="mx-auto max-w-screen-xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-bold text-ink-900">ตะกร้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="กรุณาเข้าสู่ระบบ"
          description="เพื่อบันทึกตะกร้าและสั่งซื้อสินค้า"
          action={
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
            >
              เข้าสู่ระบบ <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="mx-auto grid max-w-screen-xl gap-8 px-6 py-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72" />
      </main>
    );
  }

  if (data.items.length === 0) {
    return (
      <main className="mx-auto max-w-screen-xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-bold text-ink-900">ตะกร้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="ตะกร้าว่างเปล่า"
          description="ลองเลือกสินค้าจากหน้าฟีดดูครับ"
          action={
            <Link
              href="/feed"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
            >
              เลือกสินค้า <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  const totalCents = data.subtotalCents + SHIPPING_CENTS;

  return (
    <main className="mx-auto grid max-w-screen-xl gap-8 px-6 py-10 lg:grid-cols-[1fr_380px]">
      {/* ============== LEFT: Line items ============== */}
      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-3xl font-bold text-ink-900">ตะกร้า</h1>
          <span className="text-sm text-ink-500">
            {data.items.length} รายการ ·{' '}
            {data.items.reduce((s, i) => s + i.quantity, 0)} ชิ้น
          </span>
        </div>

        <ul className="space-y-3">
          {data.items.map((item) => {
            const lineTotal = item.unitPriceCents * item.quantity;
            return (
              <li
                key={item.id}
                className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-brand-200"
              >
                <Link
                  href={`/product/${item.productId}`}
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100"
                >
                  {item.mediaUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.mediaUrl}
                      alt={item.productName}
                      className="h-full w-full object-cover transition hover:scale-105"
                    />
                  )}
                </Link>

                <div className="flex flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      href={`/product/${item.productId}`}
                      className="line-clamp-2 text-base font-semibold text-ink-900 hover:text-brand"
                    >
                      {item.productName}
                    </Link>
                    <p className="shrink-0 text-base font-bold tabular-nums text-ink-900">
                      {formatTHB(lineTotal)}
                    </p>
                  </div>

                  <div className="flex items-end justify-between">
                    <p className="text-xs text-ink-500">
                      ราคา {formatTHB(item.unitPriceCents)} / ชิ้น
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateItem.mutate({ id: item.id, quantity: 0 })}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                        aria-label="ลบ"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        ลบ
                      </button>
                      <div className="flex items-center rounded-lg border border-ink-200">
                        <button
                          onClick={() =>
                            updateItem.mutate({
                              id: item.id,
                              quantity: item.quantity - 1,
                            })
                          }
                          className="flex h-9 w-9 items-center justify-center text-ink-700 transition hover:bg-ink-50"
                          aria-label="ลด"
                          disabled={item.quantity <= 1}
                        >
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateItem.mutate({
                              id: item.id,
                              quantity: item.quantity + 1,
                            })
                          }
                          className="flex h-9 w-9 items-center justify-center text-ink-700 transition hover:bg-ink-50"
                          aria-label="เพิ่ม"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <Link
            href="/feed"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
          >
            <ArrowRightIcon className="h-4 w-4 rotate-180" /> เลือกสินค้าเพิ่ม
          </Link>
        </div>
      </section>

      {/* ============== RIGHT: Sticky summary ============== */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          <h2 className="text-base font-bold text-ink-900">สรุปยอด</h2>

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between text-ink-600">
              <dt>ยอดสินค้า ({data.items.length} รายการ)</dt>
              <dd className="tabular-nums">{formatTHB(data.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-ink-600">
              <dt className="flex items-center gap-1">
                <TruckIcon className="h-3.5 w-3.5" /> ค่าจัดส่ง (ประมาณ)
              </dt>
              <dd className="tabular-nums">{formatTHB(SHIPPING_CENTS)}</dd>
            </div>
            <div className="border-t border-dashed border-ink-100 pt-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-sm font-bold text-ink-900">รวมทั้งหมด</dt>
                <dd className="text-2xl font-extrabold tracking-tight text-brand tabular-nums">
                  {formatTHB(totalCents)}
                </dd>
              </div>
            </div>
          </dl>

          <Button
            fullWidth
            size="lg"
            onClick={() => router.push('/checkout')}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
          >
            ไปชำระเงิน
          </Button>

          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3">
            <ShieldCheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-xs leading-relaxed text-emerald-900">
              <strong>NP Protect</strong> — เงินถูกพักจนกว่าคุณกดยืนยันรับสินค้า
            </p>
          </div>

          <p className="text-center text-[11px] text-ink-400">
            ส่วนลดและตัวเลือกขนส่งคำนวณในขั้นตอนถัดไป
          </p>
        </div>
      </aside>
    </main>
  );
}
