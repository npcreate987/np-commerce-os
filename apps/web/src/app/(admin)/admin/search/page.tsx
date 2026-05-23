'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export default function AdminSearchAnalyticsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const trendingQ = useQuery({
    queryKey: ['admin', 'search', 'trending'],
    queryFn: () => api.search.analyticsTrending(token!, 30),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const zeroQ = useQuery({
    queryKey: ['admin', 'search', 'zero'],
    queryFn: () => api.search.analyticsZeroResult(token!, 30),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <main className="container-mobile space-y-4 py-4">
      <header>
        <h1 className="font-display text-lg font-bold text-ink-900">
          Search Analytics
        </h1>
        <p className="text-xs text-ink-500">
          คำค้นยอดฮิต 7 วันล่าสุด + คำที่ไม่เจอผลลัพธ์ 30 วัน → ใช้ปรับ catalog หรือ
          เพิ่มสินค้า / synonyms ต่อไป
        </p>
      </header>

      <section className="rounded-2xl border border-ink-100 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-900">🔥 Trending (7 days)</h2>
          <span className="text-[10px] text-ink-400">
            {trendingQ.data?.length ?? 0} queries
          </span>
        </div>
        {trendingQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : trendingQ.error ? (
          <ErrBox err={trendingQ.error} />
        ) : (trendingQ.data ?? []).length === 0 ? (
          <p className="text-xs text-ink-500">ยังไม่มี data — ให้ลูกค้าลองค้นดู</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {(trendingQ.data ?? []).map((r) => (
              <li
                key={r.query}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {r.query}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {(r.zeroResultRatio * 100).toFixed(0)}% zero-result
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  {r.count.toLocaleString()} ครั้ง
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-rose-100 bg-rose-50/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-rose-700">
            ⚠️ Zero-result queries (30 days)
          </h2>
          <span className="text-[10px] text-rose-500">
            {zeroQ.data?.length ?? 0} queries
          </span>
        </div>
        <p className="mb-2 text-[11px] text-rose-700">
          ลูกค้าค้นแล้วไม่เจอ → demand สินค้าใหม่ที่ควรเพิ่มเข้า catalog
        </p>
        {zeroQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : zeroQ.error ? (
          <ErrBox err={zeroQ.error} />
        ) : (zeroQ.data ?? []).length === 0 ? (
          <p className="text-xs text-emerald-700">
            ✓ ไม่มี zero-result queries — catalog ครอบคลุมดีอยู่
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(zeroQ.data ?? []).map((r) => (
              <li
                key={r.query}
                className={cn(
                  'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200',
                )}
              >
                {r.query}
                <span className="ml-1 text-[10px] text-rose-400">
                  ×{r.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ErrBox({ err }: { err: unknown }): JSX.Element {
  return (
    <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
      โหลดไม่ได้: {err instanceof ApiError ? err.message : String(err)}
    </p>
  );
}
