'use client';

/**
 * Phase 14.5 — Orders list panel (shared).
 *
 * Pure presentational list used by:
 *  - Mobile `/orders` (full-width list)
 *  - Desktop `/orders` and `/orders/[id]` (the left "inbox" pane of
 *    the Gmail-style split-pane). When `selectedId` is provided, that
 *    row is highlighted and links keep the user inside the split-pane.
 *
 * Variants:
 *  - `'rich'` — every order shows item list + total (mobile default)
 *  - `'compact'` — single-line row with status + total (desktop inbox-feel)
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTHB } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ArrowRightIcon, PackageIcon } from '@/components/icons';

export const ORDER_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  PENDING_PAYMENT: { label: 'รอชำระเงิน', tone: 'warning' },
  PAID: { label: 'ชำระแล้ว', tone: 'info' },
  READY_TO_SHIP: { label: 'รอจัดส่ง', tone: 'info' },
  SHIPPED: { label: 'จัดส่งแล้ว', tone: 'info' },
  DELIVERED: { label: 'ถึงปลายทาง', tone: 'success' },
  COMPLETED: { label: 'สำเร็จ', tone: 'success' },
  CANCELLED: { label: 'ยกเลิก', tone: 'danger' },
  REFUNDED: { label: 'คืนเงิน', tone: 'neutral' },
};

interface OrdersListPanelProps {
  /** When set, links use this id as the active row (desktop split-pane). */
  selectedId?: string;
  /** `compact` for desktop inbox-feel, `rich` for mobile full list. */
  variant?: 'rich' | 'compact';
}

export function OrdersListPanel({
  selectedId,
  variant = 'rich',
}: OrdersListPanelProps): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.orders.mine(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) {
    return (
      <EmptyState
        icon={<PackageIcon />}
        title="กรุณาเข้าสู่ระบบ"
        description="เพื่อดูประวัติคำสั่งซื้อของคุณ"
        action={
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow"
          >
            เข้าสู่ระบบ <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className={variant === 'compact' ? 'h-16' : 'h-32'} />
        <Skeleton className={variant === 'compact' ? 'h-16' : 'h-32'} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<PackageIcon />}
        title="ยังไม่มีคำสั่งซื้อ"
        description="เริ่มช้อปปิ้งและกลับมาดูคำสั่งซื้อของคุณที่นี่"
        action={
          <Link
            href="/feed"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow"
          >
            เริ่มช้อปปิ้ง <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      />
    );
  }

  // -------------------- Compact (desktop split-pane) ----------------------
  if (variant === 'compact') {
    return (
      <ul className="divide-y divide-ink-100">
        {data.map((order) => {
          const status = ORDER_STATUS[order.status] ?? {
            label: order.status,
            tone: 'neutral' as const,
          };
          const isActive = selectedId === order.id;
          return (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className={cn(
                  'block px-4 py-3 transition',
                  isActive
                    ? 'border-l-4 border-l-brand bg-brand-50/60'
                    : 'border-l-4 border-l-transparent hover:bg-ink-50',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">
                    #{order.id.slice(0, 8)}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="line-clamp-1 text-xs text-ink-600">
                  {order.items.map((i) => i.productName).join(', ')}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-ink-400">{formatDate(order.createdAt)}</span>
                  <span className="font-bold text-brand">
                    {formatTHB(order.totalCents)}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  // -------------------- Rich (mobile) -------------------------------------
  return (
    <ul className="space-y-3">
      {data.map((order) => {
        const status = ORDER_STATUS[order.status] ?? {
          label: order.status,
          tone: 'neutral' as const,
        };
        return (
          <li
            key={order.id}
            className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card"
          >
            <Link href={`/orders/${order.id}`} className="block">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-[11px] text-ink-500">
                    #{order.id.slice(0, 8)}
                  </span>
                </div>
                <span className="text-[11px] text-ink-400">
                  {formatDate(order.createdAt)}
                </span>
              </div>
              <ul className="divide-y divide-ink-100">
                {order.items.map((i) => (
                  <li
                    key={i.id}
                    className="flex justify-between gap-3 px-4 py-2.5 text-sm"
                  >
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
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-ink-500">
                  {order.items.length} รายการ
                </span>
                <span className="text-base font-bold tracking-tight text-brand">
                  {formatTHB(order.totalCents)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
