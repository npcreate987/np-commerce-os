'use client';

/**
 * Phase 14.5 — Order detail DESKTOP variant.
 *
 * Same Gmail split-pane as `/orders` desktop, but the right side renders
 * the actual `OrderDetailPanel` for the URL `id`. The left list highlights
 * the active row via `selectedId={orderId}`.
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { ChevronLeftIcon } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { OrdersListPanel, ORDER_STATUS } from '../_list-panel';
import { OrderDetailPanel } from './_detail-panel';

export function DesktopOrderDetail(): JSX.Element {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const token = useAuthStore((s) => s.token);

  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.orders.getOne(token!, orderId),
    enabled: Boolean(token && orderId),
    retry: false,
  });
  const status = order
    ? ORDER_STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const }
    : null;

  return (
    <main className="grid h-[calc(100dvh-4rem)] grid-cols-[380px_1fr]">
      <aside className="overflow-y-auto border-r bg-white">
        <div className="sticky top-0 z-10 border-b bg-white px-4 py-3">
          <h1 className="text-base font-bold text-ink-900">คำสั่งซื้อของฉัน</h1>
          <p className="text-[11px] text-ink-500">
            เลือกคำสั่งซื้อเพื่อดูรายละเอียด
          </p>
        </div>
        <OrdersListPanel variant="compact" selectedId={orderId} />
      </aside>

      <section className="overflow-y-auto bg-ink-50">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-100 bg-white/95 px-6 py-3 backdrop-blur">
          <Link
            href="/orders"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50 lg:hidden"
            aria-label="ย้อนกลับ"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-ink-900">
              ออเดอร์ #{orderId.slice(0, 8)}
            </h2>
            {order && (
              <p className="text-[11px] text-ink-500">
                {formatDate(order.createdAt)}
              </p>
            )}
          </div>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
        </header>

        <div className="mx-auto max-w-3xl p-6">
          <OrderDetailPanel orderId={orderId} />
        </div>
      </section>
    </main>
  );
}
