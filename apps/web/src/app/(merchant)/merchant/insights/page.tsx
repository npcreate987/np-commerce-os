'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatTHB } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FlameIcon,
  MegaphoneIcon,
  SparklesIcon,
  StoreIcon,
} from '@/components/icons';
import type {
  CustomerSegment,
  DemandForecastPoint,
  InsightAnomaly,
  SalesTrendPoint,
  SegmentSummary,
  TopProduct,
} from '@np/types';

export default function MerchantInsightsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  const shopsQ = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => api.shops.mine(token!),
    enabled: !!token,
  });
  const shops = shopsQ.data ?? [];
  const currentShopId = activeShopId ?? shops[0]?.id ?? null;

  const overviewQ = useQuery({
    queryKey: ['insights', currentShopId, 'overview'],
    queryFn: () => api.insights.overview(token!, currentShopId!, 30),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const trendQ = useQuery({
    queryKey: ['insights', currentShopId, 'trend'],
    queryFn: () => api.insights.trend(token!, currentShopId!, 14),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const forecastQ = useQuery({
    queryKey: ['insights', currentShopId, 'forecast'],
    queryFn: () => api.insights.forecast(token!, currentShopId!, 7),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const topQ = useQuery({
    queryKey: ['insights', currentShopId, 'top'],
    queryFn: () => api.insights.topProducts(token!, currentShopId!, 10),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const anomQ = useQuery({
    queryKey: ['insights', currentShopId, 'anom'],
    queryFn: () => api.insights.anomalies(token!, currentShopId!),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const priceQ = useQuery({
    queryKey: ['insights', currentShopId, 'price'],
    queryFn: () => api.insights.priceSuggestions(token!, currentShopId!),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const creatorQ = useQuery({
    queryKey: ['insights', currentShopId, 'creator'],
    queryFn: () => api.insights.creatorMatches(token!, currentShopId!, 5),
    enabled: !!token && !!currentShopId,
    retry: false,
  });
  const segmentsQ = useQuery({
    queryKey: ['insights', currentShopId, 'segments'],
    queryFn: () => api.insights.segments(token!, currentShopId!),
    enabled: !!token && !!currentShopId,
    retry: false,
  });

  if (shopsQ.isLoading) {
    return (
      <main className="container-mobile space-y-3 py-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </main>
    );
  }

  if (shops.length === 0) {
    return (
      <main className="container-mobile py-6">
        <EmptyState
          title="ยังไม่มีร้าน"
          description="สร้างร้านก่อน ค่อยมาดู insights"
          icon={<StoreIcon className="h-8 w-8 text-ink-300" />}
        />
      </main>
    );
  }

  return (
    <main className="container-mobile space-y-5 pb-20 pt-4">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <SparklesIcon className="h-3 w-3" />
          AI Engine
        </p>
        <h1 className="text-xl font-bold text-ink-900">Insights สำหรับร้านคุณ</h1>
        <p className="text-xs text-ink-500">
          ยอดขาย · เทรนด์ · ของขายดี · ความเสี่ยง · แนะนำราคา · Creator
        </p>
      </header>

      {shops.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shops.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveShopId(s.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                s.id === currentShopId
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'bg-white text-ink-700 ring-1 ring-ink-200',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-3">
        <KpiCard
          label="GMV 30 วัน"
          value={formatTHB(overviewQ.data?.gmvCents ?? 0)}
          deltaBps={overviewQ.data?.gmvDeltaBps ?? 0}
          accent="brand"
          loading={overviewQ.isLoading}
        />
        <KpiCard
          label="ออเดอร์ 30 วัน"
          value={String(overviewQ.data?.orderCount ?? 0)}
          deltaBps={overviewQ.data?.orderDeltaBps ?? 0}
          accent="violet"
          loading={overviewQ.isLoading}
        />
        <KpiCard
          label="ลูกค้าไม่ซ้ำ"
          value={String(overviewQ.data?.uniqueCustomers ?? 0)}
          accent="emerald"
          loading={overviewQ.isLoading}
        />
        <KpiCard
          label="AOV (ยอดต่อออเดอร์)"
          value={formatTHB(overviewQ.data?.avgOrderValueCents ?? 0)}
          accent="amber"
          loading={overviewQ.isLoading}
        />
      </section>

      {/* Reputation pill */}
      {!overviewQ.isLoading && (overviewQ.data?.reviewCount ?? 0) > 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-glow">
            <span className="text-xl leading-none">★</span>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              คะแนนรีวิวเฉลี่ย
            </p>
            <p className="font-display text-lg font-bold text-ink-900">
              {(overviewQ.data?.avgRating ?? 0).toFixed(1)} / 5
              <span className="ml-2 text-xs font-medium text-ink-500">
                ({overviewQ.data?.reviewCount.toLocaleString()} รีวิว)
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {overviewQ.data?.conversionHint ? (
        <p className="rounded-2xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand">
          💡 {overviewQ.data.conversionHint}
        </p>
      ) : null}

      {/* Trend + forecast chart */}
      <Section title="ยอดขาย 14 วัน + คาดการณ์ 7 วัน" caption="Trend + Forecast">
        {trendQ.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (
          <TrendBars
            points={trendQ.data ?? []}
            forecast={forecastQ.data ?? []}
          />
        )}
      </Section>

      {/* Anomalies */}
      <Section title="แจ้งเตือน" caption="Anomalies">
        {anomQ.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (anomQ.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-700">
            ✓ ไม่มีสิ่งผิดปกติ
          </p>
        ) : (
          <ul className="space-y-2">
            {(anomQ.data ?? []).map((a, i) => (
              <AnomalyRow key={i} a={a} />
            ))}
          </ul>
        )}
      </Section>

      {/* Top products */}
      <Section title="ของขายดี 30 วัน" caption="Top products">
        {topQ.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (topQ.data ?? []).length === 0 ? (
          <EmptyState title="ยังไม่มีของขาย" />
        ) : (
          <ul className="space-y-2">
            {(topQ.data ?? []).map((p, i) => (
              <TopProductRow key={p.productId} p={p} rank={i + 1} />
            ))}
          </ul>
        )}
      </Section>

      {/* Price suggestions */}
      <Section title="คำแนะนำราคา" caption="Pricing">
        {priceQ.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (priceQ.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
            ราคาสมเหตุสมผลกับตลาดดีอยู่แล้ว
          </p>
        ) : (
          <ul className="space-y-2">
            {(priceQ.data ?? []).map((s) => (
              <li
                key={s.productId}
                className="rounded-2xl border border-ink-100 bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <Badge tone={s.direction === 'DECREASE' ? 'danger' : 'success'}>
                    {s.direction === 'DECREASE' ? 'ลดราคา' : 'ขึ้นราคา'}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink-900">{s.name}</p>
                    <p className="text-[11px] text-ink-500">{s.rationale}</p>
                    <div className="mt-1 text-xs text-ink-700">
                      ปัจจุบัน{' '}
                      <span className="font-semibold">
                        {formatTHB(s.currentPriceCents)}
                      </span>{' '}
                      → แนะนำ{' '}
                      <span className="font-bold text-brand">
                        {formatTHB(s.suggestedPriceCents)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Customer segments */}
      <Section title="กลุ่มลูกค้าของคุณ" caption="RFM segments">
        {segmentsQ.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (
          <SegmentsCard
            segments={segmentsQ.data ?? []}
          />
        )}
      </Section>

      {/* Creator matches */}
      <Section title="Creator แนะนำ" caption="Influencer">
        {creatorQ.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (creatorQ.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
            ยังไม่มี Creator พร้อมโปรโมท
          </p>
        ) : (
          <ul className="space-y-2">
            {(creatorQ.data ?? []).map((c) => (
              <li
                key={c.creatorId}
                className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-fuchsia-500 text-white">
                  <MegaphoneIcon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-900">
                    {c.displayName}
                  </p>
                  <p className="text-[11px] text-ink-500">{c.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-brand">
                    {Math.round(c.matchScore * 100)}%
                  </p>
                  <p className="text-[10px] text-ink-400">match</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          {caption}
        </p>
        <h2 className="font-display text-base font-bold text-ink-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  deltaBps,
  accent,
  loading,
}: {
  label: string;
  value: string;
  deltaBps?: number;
  accent: 'brand' | 'violet' | 'emerald' | 'amber';
  loading?: boolean;
}): JSX.Element {
  const accentStyles: Record<string, string> = {
    brand: 'from-brand to-fuchsia-500',
    violet: 'from-violet-500 to-indigo-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-400 to-orange-500',
  };
  if (loading) return <Skeleton className="h-24 rounded-2xl" />;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-white shadow-pop',
        accentStyles[accent],
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold tracking-tight">{value}</p>
      {typeof deltaBps === 'number' && deltaBps !== 0 ? (
        <p className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold">
          {deltaBps > 0 ? (
            <ArrowUpIcon className="h-3 w-3" />
          ) : (
            <ArrowDownIcon className="h-3 w-3" />
          )}
          {Math.abs(deltaBps / 100).toFixed(1)}%
        </p>
      ) : null}
    </div>
  );
}

function TrendBars({
  points,
  forecast,
}: {
  points: SalesTrendPoint[];
  forecast?: DemandForecastPoint[];
}): JSX.Element {
  if (points.length === 0 && (!forecast || forecast.length === 0)) {
    return (
      <p className="rounded-2xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
        ยังไม่มีข้อมูล
      </p>
    );
  }
  const fc = forecast ?? [];
  const allValues = [
    ...points.map((p) => p.gmvCents),
    ...fc.map((f) => f.upperCents),
  ];
  const max = Math.max(...allValues, 1);

  const totalForecastGmv = fc.reduce((s, f) => s + f.gmvCents, 0);
  const totalForecastOrders = fc.reduce((s, f) => s + f.orderCount, 0);

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-3">
      <div className="flex h-28 items-end gap-1">
        {points.map((p) => (
          <div
            key={p.date}
            className="flex-1 rounded-t-md bg-gradient-to-t from-brand to-fuchsia-500"
            style={{
              height: `${Math.max(4, (p.gmvCents / max) * 100)}%`,
            }}
            title={`${p.date} · ${formatTHB(p.gmvCents)} (${p.orderCount} ออเดอร์)`}
          />
        ))}
        {fc.length > 0 ? (
          <div className="w-px self-stretch bg-ink-200" aria-hidden />
        ) : null}
        {fc.map((f) => {
          const bandTop = (f.upperCents / max) * 100;
          const bandBottom = (f.lowerCents / max) * 100;
          const center = (f.gmvCents / max) * 100;
          return (
            <div
              key={f.date}
              className="relative flex-1"
              style={{ height: '100%' }}
              title={`${f.date} · คาด ${formatTHB(f.gmvCents)} (band ${formatTHB(f.lowerCents)}–${formatTHB(f.upperCents)})`}
            >
              {/* confidence band */}
              <div
                className="absolute inset-x-0 rounded-md bg-brand/15"
                style={{
                  bottom: `${bandBottom}%`,
                  height: `${Math.max(2, bandTop - bandBottom)}%`,
                }}
              />
              {/* center line */}
              <div
                className="absolute inset-x-0 h-0.5 rounded bg-brand/60"
                style={{ bottom: `${center}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-ink-400">
        <span>{points[0]?.date.slice(5) ?? ''}</span>
        <span>วันนี้</span>
        <span>{fc[fc.length - 1]?.date.slice(5) ?? ''}</span>
      </div>
      {fc.length > 0 ? (
        <p className="mt-2 rounded-xl bg-brand-50 px-2 py-1.5 text-[11px] font-semibold text-brand">
          🔮 คาด 7 วันถัดไป: {formatTHB(totalForecastGmv)} · ~{totalForecastOrders} ออเดอร์
        </p>
      ) : null}
    </div>
  );
}

function AnomalyRow({ a }: { a: InsightAnomaly }): JSX.Element {
  const colors: Record<string, string> = {
    INFO: 'border-ink-200 bg-white text-ink-700',
    WARN: 'border-amber-200 bg-amber-50 text-amber-900',
    CRITICAL: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-2xl border p-3 text-xs',
        colors[a.severity],
      )}
    >
      <FlameIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-snug">{a.message}</span>
    </li>
  );
}

const SEGMENT_TONE: Record<CustomerSegment, string> = {
  CHAMPIONS: 'from-amber-400 to-orange-500',
  LOYAL: 'from-brand to-fuchsia-500',
  NEW: 'from-emerald-500 to-teal-500',
  AT_RISK: 'from-yellow-500 to-amber-500',
  LOST: 'from-rose-500 to-pink-500',
  REGULAR: 'from-ink-400 to-ink-500',
};

function SegmentsCard({ segments }: { segments: SegmentSummary[] }): JSX.Element {
  const totalCount = segments.reduce((s, x) => s + x.count, 0);
  if (totalCount === 0) {
    return (
      <p className="rounded-2xl bg-ink-50 px-3 py-3 text-xs text-ink-500">
        ยังไม่มีลูกค้า — รอออเดอร์แรกของร้าน
      </p>
    );
  }
  const totalGmv = segments.reduce((s, x) => s + x.gmvCents, 0);
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.segment}
              className={cn(
                'h-full bg-gradient-to-r',
                SEGMENT_TONE[s.segment],
              )}
              style={{ width: `${(s.count / totalCount) * 100}%` }}
              title={`${s.label} · ${s.count} คน`}
            />
          ))}
      </div>
      <ul className="space-y-2">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <li
              key={s.segment}
              className="rounded-2xl border border-ink-100 bg-white p-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-2xl bg-gradient-to-br',
                    SEGMENT_TONE[s.segment],
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-ink-900">{s.label}</p>
                    <p className="text-xs font-bold text-brand">{s.count} คน</p>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
                    {s.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-500">
                    <span>
                      GMV{' '}
                      <span className="font-semibold text-ink-700">
                        {formatTHB(s.gmvCents)}
                      </span>
                    </span>
                    {totalGmv > 0 ? (
                      <span>
                        ({Math.round((s.gmvCents / totalGmv) * 100)}% ของยอด)
                      </span>
                    ) : null}
                  </div>
                  {s.sampleEmails.length > 0 ? (
                    <p className="mt-1 truncate text-[10px] text-ink-400">
                      เช่น {s.sampleEmails.slice(0, 3).join(', ')}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}

function TopProductRow({ p, rank }: { p: TopProduct; rank: number }): JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
        {rank}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink-900">{p.name}</p>
        <p className="text-[11px] text-ink-500">
          {p.unitsSold} ชิ้น · คงเหลือ {p.stock}
        </p>
      </div>
      <p className="text-xs font-bold text-brand">{formatTHB(p.gmvCents)}</p>
    </li>
  );
}
