'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function AdminRiskLogisticsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const q = useQuery({
    queryKey: ['admin', 'risk', 'logistics', 'full'],
    queryFn: () => api.risk.logisticsIssues(token!),
    enabled: !!token,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <main className="container-mobile space-y-3 py-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </main>
    );
  }

  const list = q.data ?? [];

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <h1 className="text-xl font-bold text-ink-900">ขนส่งมีปัญหา</h1>
      <p className="text-xs text-ink-500">
        คำนวณ late rate (ส่งช้ากว่า 3 วัน) + เวลาเฉลี่ย ใน 30 วันล่าสุด
      </p>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
          ยังไม่มี shipment ใน 30 วัน
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => {
            const levelTone: Record<string, 'success' | 'warning' | 'danger'> = {
              LOW: 'success',
              MEDIUM: 'warning',
              HIGH: 'danger',
            };
            return (
              <li
                key={c.carrierCode}
                className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card"
              >
                <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-ink-900">{c.carrierName}</p>
                    <p className="text-[10px] text-ink-500">{c.carrierCode}</p>
                  </div>
                  <Badge tone={levelTone[c.level]}>{c.level}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center">
                  <Mini label="Shipments 30d" value={String(c.shipments30d)} />
                  <Mini
                    label="ส่งช้า"
                    value={`${(c.lateRateBps / 100).toFixed(1)}%`}
                  />
                  <Mini label="เฉลี่ย" value={`${c.avgLeadHours} ชม.`} />
                </div>
                <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-600">
                  {c.note}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className="text-xs font-bold text-ink-900">{value}</p>
    </div>
  );
}
