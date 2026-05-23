'use client';

/**
 * Phase 14.5 — Order detail MOBILE variant.
 * Sticky glass header + container-mobile body wrapping the shared panel.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { ChevronLeftIcon } from '@/components/icons';
import { ORDER_STATUS } from '../_list-panel';
import { OrderDetailPanel } from './_detail-panel';

export function MobileOrderDetail(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const token = useAuthStore((s) => s.token);

  // Lightweight query just for the sticky header — uses the same cache key
  // as `OrderDetailPanel`, so this and the panel share one network call.
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
    <main className="pb-28">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
            aria-label="ย้อนกลับ"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
              ออเดอร์ #{orderId.slice(0, 8)}
            </h1>
            {order && (
              <p className="text-[11px] text-ink-500">
                {formatDate(order.createdAt)}
              </p>
            )}
          </div>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
        </div>
      </header>

      <div className="container-mobile pt-4">
        <OrderDetailPanel orderId={orderId} />
      </div>
    </main>
  );
}
