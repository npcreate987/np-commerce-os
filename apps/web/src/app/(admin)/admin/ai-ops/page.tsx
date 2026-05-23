'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ActivityIcon, SparklesIcon } from '@/components/icons';
import type { ModelRunRecent } from '@np/types';
import { cn } from '@/lib/cn';

export default function AdminAiOpsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const summaryQ = useQuery({
    queryKey: ['aiops', 'summary'],
    queryFn: () => api.aiOps.summary(token!),
    enabled: !!token,
    refetchInterval: 15_000,
  });
  const recentQ = useQuery({
    queryKey: ['aiops', 'recent'],
    queryFn: () => api.aiOps.recent(token!, 50),
    enabled: !!token,
    refetchInterval: 15_000,
  });

  return (
    <main className="container-mobile space-y-5 pb-24 pt-4">
      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <SparklesIcon className="h-3 w-3" />
          AI Ops
        </p>
        <h1 className="text-xl font-bold text-ink-900">AI Engine — Health</h1>
        <p className="text-xs text-ink-500">
          ดู latency / fail rate ของทุก AI call · refresh ทุก 15 วินาที
        </p>
      </header>

      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          ภาพรวม 7 วัน
        </p>
        {summaryQ.isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (summaryQ.data ?? []).length === 0 ? (
          <EmptyState
            title="ยังไม่มี AI runs"
            description="ลองเรียก /v1/recommendations/for-you ก่อน แล้วกลับมาดู"
            icon={<ActivityIcon className="h-8 w-8 text-ink-300" />}
          />
        ) : (
          <ul className="space-y-2">
            {(summaryQ.data ?? []).map((s) => (
              <li
                key={s.kind}
                className="rounded-2xl border border-ink-100 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold text-ink-900">
                      {s.kind}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      24h: {s.runs24h.toLocaleString()} · 7d:{' '}
                      {s.runs7d.toLocaleString()}
                    </p>
                  </div>
                  <FailBadge rate={s.failRate} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Metric label="avg" value={`${s.avgMs.toFixed(1)}ms`} />
                  <Metric label="p95" value={`${s.p95Ms}ms`} />
                  <Metric
                    label="last"
                    value={s.lastRunAt ? timeAgo(s.lastRunAt) : '—'}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          50 รายการล่าสุด
        </p>
        {recentQ.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : (recentQ.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-ink-50 px-3 py-3 text-center text-xs text-ink-500">
            ยังไม่มี runs
          </p>
        ) : (
          <ul className="space-y-1">
            {(recentQ.data ?? []).map((r) => (
              <RecentRow key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-xl bg-ink-50 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <p className="font-mono text-sm font-bold text-ink-900">{value}</p>
    </div>
  );
}

function FailBadge({ rate }: { rate: number }): JSX.Element {
  const pct = Math.round(rate * 100);
  const tone = pct === 0
    ? 'bg-emerald-100 text-emerald-700'
    : pct < 5
      ? 'bg-amber-100 text-amber-700'
      : 'bg-rose-100 text-rose-700';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
        tone,
      )}
    >
      fail {pct}%
    </span>
  );
}

function RecentRow({ r }: { r: ModelRunRecent }): JSX.Element {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs',
        r.status === 'FAIL' ? 'border-rose-200' : 'border-ink-100',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          r.status === 'FAIL' ? 'bg-rose-500' : 'bg-emerald-500',
        )}
      />
      <span className="flex-1 truncate font-mono text-[11px] text-ink-700">
        {r.kind}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-ink-500">
        {r.durationMs}ms
      </span>
      <span className="shrink-0 text-[10px] text-ink-400">
        {timeAgo(r.createdAt)}
      </span>
    </li>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}วิ`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}น.`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}ชม.`;
  return `${Math.floor(diff / 86_400_000)}ว.`;
}
