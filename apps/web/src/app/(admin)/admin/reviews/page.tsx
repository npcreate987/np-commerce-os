'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StarRating } from '@/components/rating';
import type { ModerationReview } from '@np/types';
import { cn } from '@/lib/cn';

const FLAG_LABELS: Record<string, string> = {
  SHORT_BODY: 'ข้อความสั้น',
  NEW_ACCOUNT: 'บัญชีใหม่ < 24ชม.',
  DUPLICATE_TEXT: 'ข้อความซ้ำคนอื่น',
  LOW_EFFORT_FIVE_STAR: '5 ดาวสั้น',
  LOW_EFFORT_ONE_STAR: '1 ดาวสั้น',
};

export default function AdminReviewsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const listQ = useQuery({
    queryKey: ['admin', 'reviews', 'moderation'],
    queryFn: () => api.reviews.moderation(token!, 100),
    enabled: !!token,
    retry: false,
  });

  const data = listQ.data ?? [];
  const visible = filterFlagged ? data.filter((r) => r.flags.length > 0) : data;
  const flaggedCount = data.filter((r) => r.flags.length > 0).length;

  return (
    <main className="mx-auto w-full max-w-screen-xl space-y-4 px-4 pb-20 pt-4 lg:px-8 lg:pt-6">
      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <span className="text-base leading-none">★</span>
          Moderation
        </p>
        <h1 className="text-xl font-bold text-ink-900 lg:text-2xl">รีวิวลูกค้า</h1>
        <p className="text-xs text-ink-500 lg:text-sm">
          ตรวจรีวิวต้องสงสัย · ซ่อน/เปิดโชว์ · ใช้ heuristic แบบ deterministic
        </p>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterFlagged(false)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            !filterFlagged
              ? 'bg-brand-gradient text-white shadow-glow'
              : 'bg-white text-ink-700 ring-1 ring-ink-200',
          )}
        >
          ทั้งหมด ({data.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterFlagged(true)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            filterFlagged
              ? 'bg-rose-500 text-white shadow-glow'
              : 'bg-white text-ink-700 ring-1 ring-ink-200',
          )}
        >
          ⚠️ น่าสงสัย ({flaggedCount})
        </button>
      </div>

      {listQ.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filterFlagged ? 'ไม่มีรีวิวต้องสงสัย' : 'ยังไม่มีรีวิว'}
          description="ระบบ heuristic ตรวจอัตโนมัติทุกรีวิวที่ลูกค้าส่ง"
        />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {visible.map((r) => (
            <ReviewRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ReviewRow({ r }: { r: ModerationReview }): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const toggleM = useMutation({
    mutationFn: (hidden: boolean) =>
      api.reviews.hide(token!, r.id, { hidden, reason: 'admin_moderation' }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] }),
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'ไม่สำเร็จ'),
  });

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white p-3',
        r.isHidden
          ? 'border-rose-200 opacity-60'
          : r.flags.length > 0
            ? 'border-amber-200'
            : 'border-ink-100',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StarRating value={r.rating} size="sm" />
            <span className="text-xs font-semibold text-ink-900">
              {r.authorDisplay}
            </span>
            {r.isHidden ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                ซ่อนอยู่
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">
            {r.productName} · {r.shopName ?? '—'}
          </p>
        </div>
        {r.flags.length > 0 ? (
          <div className="text-right">
            <p className="text-[10px] font-bold text-rose-700">
              {Math.round(r.suspicionScore * 100)}%
            </p>
            <p className="text-[9px] text-ink-400">suspicion</p>
          </div>
        ) : null}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-700">
        {r.body}
      </p>

      {r.flags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.flags.map((f) => (
            <span
              key={f}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
            >
              ⚠️ {FLAG_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10px] text-ink-400">
          {new Date(r.createdAt).toLocaleString('th-TH')}
        </p>
        <button
          type="button"
          onClick={() => toggleM.mutate(!r.isHidden)}
          disabled={toggleM.isPending}
          className={cn(
            'rounded-full px-3 py-1 text-[11px] font-bold disabled:opacity-50',
            r.isHidden
              ? 'bg-emerald-500 text-white'
              : 'bg-rose-500 text-white',
          )}
        >
          {r.isHidden ? 'เปิดโชว์' : 'ซ่อน'}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-[10px] text-rose-500">{error}</p>
      ) : null}
    </li>
  );
}
