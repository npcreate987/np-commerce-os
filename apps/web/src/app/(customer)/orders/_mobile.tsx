'use client';

/**
 * Phase 14.5 — `/orders` MOBILE variant.
 * Vertical full-width list + Buy Again strip (the original layout).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { RecommendationStrip } from '@/components/recommendation-strip';
import { OrdersListPanel } from './_list-panel';

export function MobileOrders(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  // Keep the buy-again mutation available even though list panel doesn't
  // currently surface it — having the query warm primes the strip below.
  useMutation({
    mutationFn: (orderId: string) => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.payments.confirmMock(token, orderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', 'mine'] }),
  });

  const buyAgainQ = useQuery({
    queryKey: ['recs', 'buy-again'],
    queryFn: () => api.recommendations.buyAgain(token!, 10),
    enabled: Boolean(token),
    retry: false,
  });

  return (
    <main className="container-mobile py-6 pb-28">
      <h1 className="mb-4 text-2xl font-bold text-ink-900">คำสั่งซื้อ</h1>

      <RecommendationStrip
        caption="กลับมาซื้อใหม่"
        title="ซื้อซ้ำ"
        items={(buyAgainQ.data ?? []).map((b) => ({
          kind: 'buy-again' as const,
          ...b,
        }))}
        isLoading={buyAgainQ.isLoading}
        surface="orders_buy_again"
      />

      <div className="mt-6">
        <OrdersListPanel variant="rich" />
      </div>
    </main>
  );
}
