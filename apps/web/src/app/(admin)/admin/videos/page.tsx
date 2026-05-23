'use client';

/**
 * Phase 12.2 — `/admin/videos`
 *
 * Two tabs in one page:
 *   1. คลิป — all videos with moderation context (open reports count)
 *      Status pills filter: ทั้งหมด / รายงาน / เผยแพร่ / ซ่อน
 *      Row action: ดู / ซ่อน / เปิดโชว์ / ลบถาวร
 *   2. รายงาน — flat list of pending VideoReport rows so support can triage
 *      each report individually
 *
 * Both views share a single right-side `VideoActionBar` so an admin can
 * resolve a row (HIDE/KEEP/DELETE) without leaving the page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FlagIcon, VideoIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type {
  AdminVideoRow,
  ModerateVideoInput,
  VideoReportReason,
  VideoReportRow,
  VideoStatus,
} from '@np/types';

const STATUS_TABS: Array<{ value: VideoStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'REPORTED', label: 'ถูกรายงาน' },
  { value: 'ACTIVE', label: 'เผยแพร่' },
  { value: 'HIDDEN', label: 'ซ่อน' },
];

const REASON_LABELS: Record<VideoReportReason, string> = {
  SPAM: 'สแปม',
  NUDITY: 'โป๊เปลือย',
  VIOLENCE: 'รุนแรง',
  HATE: 'เกลียดชัง',
  MISINFO: 'ข้อมูลเท็จ',
  COPYRIGHT: 'ละเมิดลิขสิทธิ์',
  OTHER: 'อื่น ๆ',
};

const STATUS_BADGE: Record<
  VideoStatus,
  { label: string; cls: string }
> = {
  ACTIVE:   { label: 'เผยแพร่',   cls: 'bg-emerald-100 text-emerald-700' },
  REPORTED: { label: 'รายงาน',    cls: 'bg-amber-100 text-amber-800'    },
  HIDDEN:   { label: 'ซ่อนอยู่',  cls: 'bg-rose-100 text-rose-700'      },
  DELETED:  { label: 'ลบแล้ว',    cls: 'bg-ink-100 text-ink-700'        },
};

export default function AdminVideosPage(): JSX.Element {
  const [tab, setTab] = useState<'videos' | 'reports'>('videos');

  return (
    <main className="mx-auto w-full max-w-screen-xl space-y-4 px-4 pb-20 pt-4 lg:px-8 lg:pt-6">
      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <FlagIcon className="h-3.5 w-3.5" />
          Moderation
        </p>
        <h1 className="text-xl font-bold text-ink-900 lg:text-2xl">วิดีโอ</h1>
        <p className="text-xs text-ink-500 lg:text-sm">
          ตรวจคลิป UGC · จัดการรายงานจากผู้ใช้ · ซ่อน/ลบ + cleanup ไฟล์ใน bucket
        </p>
      </header>

      <div className="flex items-center gap-2 border-b">
        <TabPill active={tab === 'videos'} onClick={() => setTab('videos')}>
          คลิป
        </TabPill>
        <TabPill active={tab === 'reports'} onClick={() => setTab('reports')}>
          รายงานล่าสุด
        </TabPill>
      </div>

      {tab === 'videos' ? <VideosTab /> : <ReportsTab />}
    </main>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-ink-500 hover:text-ink-700',
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Tab 1 — Videos list
// ============================================================================

function VideosTab(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<VideoStatus | 'ALL'>('REPORTED');
  const listQ = useQuery({
    queryKey: ['admin', 'videos', status],
    queryFn: () => api.feed.admin.list(token!, { status, limit: 100 }),
    enabled: !!token,
    refetchInterval: 30_000,
  });
  const counts = useMemo(() => {
    const all = listQ.data?.length ?? 0;
    const reported = listQ.data?.filter((v) => v.pendingReports > 0).length ?? 0;
    return { all, reported };
  }, [listQ.data]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setStatus(t.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              status === t.value
                ? t.value === 'REPORTED'
                  ? 'bg-amber-500 text-white shadow-glow'
                  : t.value === 'HIDDEN'
                    ? 'bg-rose-500 text-white shadow-glow'
                    : 'bg-brand-gradient text-white shadow-glow'
                : 'bg-white text-ink-700 ring-1 ring-ink-200',
            )}
          >
            {t.label}
            {status === t.value ? (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                {counts.all}
              </span>
            ) : null}
          </button>
        ))}
        {counts.reported > 0 && status !== 'REPORTED' ? (
          <span className="text-[11px] text-amber-700">
            ⚠️ {counts.reported} คลิปมี report ค้าง
          </span>
        ) : null}
      </div>

      {listQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : (listQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<VideoIcon />}
          title={
            status === 'REPORTED'
              ? 'ไม่มีคลิปที่ถูกรายงาน 🎉'
              : 'ไม่มีคลิป'
          }
          description="คิวว่าง — กลับมาเช็คอีก 5 นาที"
        />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {listQ.data!.map((v) => (
            <AdminVideoRowItem key={v.id} v={v} />
          ))}
        </ul>
      )}
    </>
  );
}

function AdminVideoRowItem({ v }: { v: AdminVideoRow }): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const moderateM = useMutation({
    mutationFn: (input: ModerateVideoInput) =>
      api.feed.admin.moderate(token!, v.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'videos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'videos', 'reports'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ไม่สำเร็จ'),
  });

  const badge = STATUS_BADGE[v.status];

  return (
    <li
      className={cn(
        'flex gap-3 rounded-2xl border bg-white p-3',
        v.pendingReports > 0
          ? 'border-amber-200'
          : v.status === 'HIDDEN'
            ? 'border-rose-200 opacity-70'
            : 'border-ink-100',
      )}
    >
      <Link
        href={`/feed?v=${v.id}`}
        target="_blank"
        className="relative block h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-900"
      >
        {v.thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={v.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            <VideoIcon className="h-5 w-5" />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('pill', badge.cls)}>{badge.label}</span>
          {v.pendingReports > 0 ? (
            <span className="pill bg-amber-100 text-amber-800">
              ⚠️ {v.pendingReports} report
            </span>
          ) : null}
          {v.lastReportReason ? (
            <span className="text-[10px] text-ink-500">
              ล่าสุด: {REASON_LABELS[v.lastReportReason]}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-ink-700">
          {v.caption || <span className="italic text-ink-400">ไม่มีคำอธิบาย</span>}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-400">
          @{v.authorName} · {v.views} views · {v.likes} likes · {formatDate(v.createdAt)}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          <Link
            href={`/feed?v=${v.id}`}
            target="_blank"
            className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-700 ring-1 ring-ink-200"
          >
            ดู
          </Link>
          {v.status !== 'HIDDEN' && v.status !== 'DELETED' && (
            <button
              type="button"
              disabled={moderateM.isPending}
              onClick={() => moderateM.mutate({ action: 'HIDE' })}
              className="rounded-full bg-rose-500 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            >
              ซ่อน
            </button>
          )}
          {(v.status === 'HIDDEN' || v.status === 'REPORTED') && (
            <button
              type="button"
              disabled={moderateM.isPending}
              onClick={() => moderateM.mutate({ action: 'RESTORE' })}
              className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            >
              เปิดโชว์
            </button>
          )}
          {v.status !== 'DELETED' && (
            <button
              type="button"
              disabled={moderateM.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `ลบคลิปนี้ถาวร? ไฟล์ใน bucket จะถูกลบด้วย\n\n"${v.caption.slice(0, 60)}"`,
                  )
                ) {
                  moderateM.mutate({ action: 'DELETE' });
                }
              }}
              className="rounded-full bg-ink-900 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            >
              ลบถาวร
            </button>
          )}
        </div>
        {error ? <p className="mt-1 text-[10px] text-rose-500">{error}</p> : null}
      </div>
    </li>
  );
}

// ============================================================================
// Tab 2 — Reports list
// ============================================================================

function ReportsTab(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<'PENDING' | 'RESOLVED' | 'ALL'>('PENDING');
  const listQ = useQuery({
    queryKey: ['admin', 'videos', 'reports', status],
    queryFn: () => api.feed.admin.reports(token!, { status, limit: 200 }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <>
      <div className="flex items-center gap-2">
        {(['PENDING', 'RESOLVED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              status === s
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'bg-white text-ink-700 ring-1 ring-ink-200',
            )}
          >
            {s === 'PENDING' ? 'รอตรวจ' : s === 'RESOLVED' ? 'จัดการแล้ว' : 'ทั้งหมด'}
            {status === s && listQ.data ? (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                {listQ.data.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {listQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : (listQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<FlagIcon />}
          title="ไม่มีรายงาน"
          description="ผู้ใช้ยังไม่ได้กดรายงานคลิปไหน"
        />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {listQ.data!.map((r) => (
            <ReportRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </>
  );
}

function ReportRow({ r }: { r: VideoReportRow }): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const moderateM = useMutation({
    mutationFn: (input: ModerateVideoInput) =>
      api.feed.admin.moderate(token!, r.videoId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'videos'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ไม่สำเร็จ'),
  });

  const badge = STATUS_BADGE[r.videoStatus];

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white p-3',
        r.status === 'PENDING' ? 'border-amber-200' : 'border-ink-100 opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/feed?v=${r.videoId}`}
          target="_blank"
          className="relative block h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-ink-900"
        >
          {r.videoThumbUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={r.videoThumbUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/40">
              <VideoIcon className="h-4 w-4" />
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pill bg-amber-100 text-amber-800">
              {REASON_LABELS[r.reason]}
            </span>
            <span className={cn('pill', badge.cls)}>{badge.label}</span>
            {r.status === 'RESOLVED' && r.resolution ? (
              <span className="pill bg-ink-100 text-ink-700">
                → {r.resolution === 'HIDE' ? 'ซ่อน' : r.resolution === 'DELETE' ? 'ลบ' : 'เก็บไว้'}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-ink-700">
            {r.videoCaption || <span className="italic text-ink-400">ไม่มีคำอธิบาย</span>}
          </p>
          {r.note ? (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              “{r.note}”
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-ink-400">
            @{r.reporterName ?? r.reporterId.slice(0, 8)} รายงาน · เจ้าของคลิป @{r.authorName ?? r.authorId.slice(0, 8)} ·{' '}
            {formatDate(r.createdAt)}
          </p>

          {r.status === 'PENDING' && (
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={moderateM.isPending}
                onClick={() => moderateM.mutate({ action: 'RESTORE' })}
                className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
              >
                เก็บคลิปไว้
              </button>
              <button
                type="button"
                disabled={moderateM.isPending}
                onClick={() => moderateM.mutate({ action: 'HIDE' })}
                className="rounded-full bg-rose-500 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
              >
                ซ่อนคลิป
              </button>
              <button
                type="button"
                disabled={moderateM.isPending}
                onClick={() => {
                  if (window.confirm('ลบคลิปนี้ถาวร? (เคลียร์ไฟล์ใน bucket ด้วย)')) {
                    moderateM.mutate({ action: 'DELETE' });
                  }
                }}
                className="rounded-full bg-ink-900 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
              >
                ลบถาวร
              </button>
            </div>
          )}
          {error ? <p className="mt-1 text-[10px] text-rose-500">{error}</p> : null}
        </div>
      </div>
    </li>
  );
}
