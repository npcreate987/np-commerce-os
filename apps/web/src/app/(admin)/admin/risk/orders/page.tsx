'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatTHB, formatDate } from '@/lib/format';

export default function AdminRiskOrdersPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const q = useQuery({
    queryKey: ['admin', 'risk', 'orders', 'full'],
    queryFn: () => api.risk.suspiciousOrders(token!, 100),
    enabled: !!token,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <main className="container-mobile space-y-3 py-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </main>
    );
  }

  const list = q.data ?? [];

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <h1 className="text-xl font-bold text-ink-900">ออเดอร์ผิดปกติ</h1>
      <p className="text-xs text-ink-500">
        AI ตรวจ: ยอดสูง · บัญชีใหม่ + ยอดสูง · velocity (มากกว่า 4 ออเดอร์/ชม.)
      </p>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-700">
          ✓ ไม่มีออเดอร์ที่น่าสงสัยใน 30 วันล่าสุด
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => {
            const levelTone: Record<string, 'success' | 'warning' | 'danger'> = {
              LOW: 'success',
              MEDIUM: 'warning',
              HIGH: 'danger',
            };
            return (
              <li
                key={o.orderId}
                className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card"
              >
                <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-ink-900">
                      #{o.orderId.slice(0, 10)}
                    </p>
                    <p className="text-[10px] text-ink-500">
                      {o.customerEmail} · {o.shopName}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={levelTone[o.level]}>{o.level}</Badge>
                    <p className="mt-0.5 text-xs font-bold text-brand">
                      score {o.score}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-base font-bold text-ink-900">
                    {formatTHB(o.totalCents)}
                  </span>
                  <span className="text-[11px] text-ink-400">
                    {formatDate(o.createdAt)}
                  </span>
                </div>
                <div className="border-t border-ink-100 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    flags
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {o.flags.map((f, i) => (
                      <li
                        key={i}
                        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
