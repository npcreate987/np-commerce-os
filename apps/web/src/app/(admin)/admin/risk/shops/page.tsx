'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatTHB } from '@/lib/format';
import type { ShopRisk } from '@np/types';

type FilterLevel = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

export default function AdminRiskShopsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [filter, setFilter] = useState<FilterLevel>('ALL');

  const q = useQuery({
    queryKey: ['admin', 'risk', 'shops', 'full'],
    queryFn: () => api.risk.shops(token!, 200),
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

  const list = (q.data ?? []).filter((s) => filter === 'ALL' || s.level === filter);

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <h1 className="text-xl font-bold text-ink-900">ร้านเสี่ยง</h1>
      <p className="text-xs text-ink-500">
        เรียงจาก risk score มาก → น้อย · คำนวณจาก refund/dispute/age + GMV
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as FilterLevel[]).map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setFilter(lv)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              filter === lv ? 'bg-brand text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200'
            }`}
          >
            {lv === 'ALL' ? 'ทั้งหมด' : lv}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-700">
          ✓ ไม่มีร้านในระดับนี้
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((s) => (
            <ShopRiskCard key={s.shopId} shop={s} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ShopRiskCard({ shop }: { shop: ShopRisk }): JSX.Element {
  const levelTone: Record<string, 'success' | 'warning' | 'danger'> = {
    LOW: 'success',
    MEDIUM: 'warning',
    HIGH: 'danger',
  };
  return (
    <li className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
        <div>
          <p className="text-sm font-bold text-ink-900">{shop.shopName}</p>
          <p className="text-[10px] text-ink-500">{shop.ownerEmail}</p>
        </div>
        <div className="text-right">
          <Badge tone={levelTone[shop.level]}>{shop.level}</Badge>
          <p className="mt-0.5 font-display text-lg font-bold leading-none text-ink-900">
            {shop.score}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 border-b border-ink-100 px-4 py-3 text-center">
        <Mini label="GMV 30d" value={formatTHB(shop.gmv30dCents)} />
        <Mini label="ออเดอร์" value={String(shop.orders30d)} />
        <Mini label="เคส" value={String(shop.disputes30d)} />
        <Mini label="คืนเงิน" value={String(shop.refunds30d)} />
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          factor breakdown
        </p>
        <ul className="space-y-1">
          {shop.factors.map((f) => (
            <li
              key={f.key}
              className={`flex items-center justify-between rounded-xl px-2 py-1 text-xs ${
                f.triggered
                  ? 'bg-rose-50 text-rose-900'
                  : 'bg-ink-50/50 text-ink-500'
              }`}
            >
              <span>{f.label}</span>
              <span className="font-semibold tabular-nums">
                {f.value} / {f.threshold} · w{f.weight}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
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
