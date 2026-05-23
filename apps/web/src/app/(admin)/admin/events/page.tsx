'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

const KIND_BADGE_TONE: Record<string, string> = {
  purchase: 'bg-emerald-100 text-emerald-700',
  add_to_cart: 'bg-amber-100 text-amber-700',
  reco_click: 'bg-violet-100 text-violet-700',
  reco_impression: 'bg-ink-100 text-ink-600',
};

export default function AdminEventsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const statsQ = useQuery({
    queryKey: ['admin', 'events', 'stats'],
    queryFn: () => api.events.stats(token!),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <main className="container-mobile space-y-5 pb-20 pt-4">
      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <span className="text-base leading-none">📡</span>
          Behavioural Firehose
        </p>
        <h1 className="text-xl font-bold text-ink-900">Event Stream — 24 ชั่วโมงล่าสุด</h1>
        <p className="text-xs text-ink-500">
          ระบบเก็บ event ทุกการคลิก/ดู/ค้นหา/ซื้อ เพื่อให้ ranker (Phase 10.2)
          เรียนรู้พฤติกรรม user แบบ Facebook/Google
        </p>
      </header>

      {statsQ.isLoading || !statsQ.data ? (
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <section className="grid grid-cols-3 gap-3">
            <KpiTile
              label="Events"
              value={statsQ.data.totalLast24h}
              tone="rose"
            />
            <KpiTile
              label="Unique users"
              value={statsQ.data.uniqueUsersLast24h}
              tone="violet"
            />
            <KpiTile
              label="Sessions"
              value={statsQ.data.uniqueSessionsLast24h}
              tone="amber"
            />
          </section>

          {/* By kind */}
          <section className="rounded-3xl bg-white p-4 ring-1 ring-ink-100">
            <h2 className="text-sm font-bold text-ink-900">แยกตามชนิด event</h2>
            <p className="mb-3 text-[11px] text-ink-500">
              top kinds ใน 24 ชม. — purchase / add_to_cart / search_query
              คือสัญญาณสำคัญสำหรับ ranker
            </p>
            {statsQ.data.byKind.length === 0 ? (
              <EmptyState
                title="ยังไม่มี events"
                description="ลองเปิด customer app แล้วเลื่อนดูสินค้าเพื่อให้ firehose เริ่มทำงาน"
              />
            ) : (
              <ul className="space-y-1.5">
                {statsQ.data.byKind.slice(0, 12).map((row) => {
                  const max = statsQ.data?.byKind[0]?.count ?? 1;
                  const pct = (row.count / max) * 100;
                  const tone =
                    KIND_BADGE_TONE[row.kind] ?? 'bg-ink-100 text-ink-700';
                  return (
                    <li key={row.kind} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'min-w-[120px] rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          tone,
                        )}
                      >
                        {row.kind}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-50">
                        <div
                          className="h-full rounded-full bg-brand-gradient"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="min-w-[40px] text-right text-[11px] font-bold text-ink-700">
                        {row.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* By surface */}
          <section className="rounded-3xl bg-white p-4 ring-1 ring-ink-100">
            <h2 className="text-sm font-bold text-ink-900">แยกตาม surface</h2>
            <p className="mb-3 text-[11px] text-ink-500">
              พื้นที่ใน UI ที่ผู้ใช้คลิกเยอะที่สุด — ใช้ดูว่า rail ไหนทำงานดี
            </p>
            {statsQ.data.bySurface.length === 0 ? (
              <p className="text-xs text-ink-500">ยังไม่มีข้อมูล</p>
            ) : (
              <ul className="space-y-1.5">
                {statsQ.data.bySurface.map((row) => {
                  const max = statsQ.data?.bySurface[0]?.count ?? 1;
                  const pct = (row.count / max) * 100;
                  return (
                    <li key={row.surface} className="flex items-center gap-2">
                      <span className="min-w-[120px] truncate rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        {row.surface}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-50">
                        <div
                          className="h-full rounded-full bg-accent-violet"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="min-w-[40px] text-right text-[11px] font-bold text-ink-700">
                        {row.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'rose' | 'violet' | 'amber';
}): JSX.Element {
  const styles: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-900 ring-rose-200',
    violet: 'bg-violet-50 text-violet-900 ring-violet-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  };
  return (
    <div className={cn('rounded-2xl p-3 ring-1', styles[tone])}>
      <p className="text-[9px] font-semibold uppercase tracking-widest opacity-80">
        {label}
      </p>
      <p className="font-display text-2xl font-bold leading-tight">
        {new Intl.NumberFormat('th-TH').format(value)}
      </p>
      <p className="text-[10px] opacity-70">24 ชั่วโมงล่าสุด</p>
    </div>
  );
}
