'use client';

/**
 * Phase 12.2 — `/profile/videos`
 *
 * "My Videos" — owner sees every clip they've ever uploaded (including
 * HIDDEN/REPORTED ones, which a regular feed visitor cannot see).
 *
 * Per row:
 *   • Thumbnail with HOVER preview muted, ratio 9:16
 *   • Title (caption) + stats (views • likes)
 *   • Status badge — explains *why* a video may be missing from /feed
 *     (e.g. "ซ่อนจากทีมงาน") so authors don't think it's a bug
 *   • "ดู" → open in /feed?v=<id>
 *   • "ลบ" → confirm + soft-delete (bucket cleanup happens server-side)
 *
 * Auth-gated identical to /feed/create (redirect + fallback EmptyState).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { VideoFeedItem, VideoStatus } from '@np/types';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { VideoIcon, ArrowRightIcon } from '@/components/icons';
import { formatDate } from '@/lib/format';

const STATUS_BADGE: Record<
  VideoStatus,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  ACTIVE:   { label: 'เผยแพร่',         tone: 'success' },
  REPORTED: { label: 'อยู่ระหว่างตรวจสอบ', tone: 'warning' },
  HIDDEN:   { label: 'ซ่อนจากทีมงาน',     tone: 'danger'  },
  DELETED:  { label: 'ลบแล้ว',            tone: 'neutral' },
};

export default function MyVideosPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const router = useRouter();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && token === null) {
      router.replace('/login?next=%2Fprofile%2Fvideos');
    }
  }, [hasHydrated, token, router]);

  const listQ = useQuery({
    queryKey: ['feed', 'mine'],
    queryFn: () => api.feed.mine(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const removeM = useMutation({
    mutationFn: (id: string) => api.feed.remove(token!, id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed', 'mine'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  if (!hasHydrated) {
    return (
      <main className="container-mobile space-y-3 py-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="aspect-[9/16] rounded-2xl" />
          <Skeleton className="aspect-[9/16] rounded-2xl" />
          <Skeleton className="aspect-[9/16] rounded-2xl" />
        </div>
      </main>
    );
  }

  if (token === null) {
    return (
      <main className="container-mobile py-16">
        <EmptyState
          icon={<VideoIcon />}
          title="ต้องเข้าสู่ระบบ"
          description="ดูคลิปของคุณได้เฉพาะหลังเข้าสู่ระบบเท่านั้น"
          action={
            <Link
              href="/login?next=%2Fprofile%2Fvideos"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="container-mobile space-y-4 py-6 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">คลิปของฉัน</h1>
          <p className="text-sm text-ink-500">
            {listQ.data?.length ?? 0} คลิป — รวมที่ซ่อนหรืออยู่ระหว่างตรวจสอบ
          </p>
        </div>
        <Link
          href="/feed/create"
          className="inline-flex h-10 items-center justify-center gap-1 rounded-2xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow active:scale-95"
        >
          + โพสต์ใหม่
        </Link>
      </header>

      {listQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="aspect-[9/16] rounded-2xl" />
          <Skeleton className="aspect-[9/16] rounded-2xl" />
          <Skeleton className="aspect-[9/16] rounded-2xl" />
        </div>
      ) : listQ.data && listQ.data.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listQ.data.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onDelete={() => {
                if (
                  window.confirm(
                    `ลบคลิป "${v.caption.slice(0, 40) || 'ไม่มีคำอธิบาย'}" ?\n` +
                      'การลบจะถาวร ไฟล์วิดีโอจะถูกลบจาก server ด้วย',
                  )
                ) {
                  removeM.mutate(v.id);
                }
              }}
              deleting={deletingId === v.id}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<VideoIcon />}
          title="ยังไม่มีคลิป"
          description="โพสต์คลิปแรกของคุณเลย — คลิปจะแสดงในฟีดให้ทุกคนเห็น"
          action={
            <Link
              href="/feed/create"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              + โพสต์ใหม่
            </Link>
          }
        />
      )}
    </main>
  );
}

function VideoCard({
  video: v,
  onDelete,
  deleting,
}: {
  video: VideoFeedItem;
  onDelete: () => void;
  deleting: boolean;
}): JSX.Element {
  const status = STATUS_BADGE[v.status];
  return (
    <li className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <Link
        href={`/feed?v=${v.id}`}
        className="relative block aspect-[9/16] bg-ink-900"
      >
        {v.thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={v.thumbUrl}
            alt={v.caption || 'video'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/50">
            <VideoIcon className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">
          <div className="line-clamp-2 font-medium">
            {v.caption || 'ไม่มีคำอธิบาย'}
          </div>
          <div className="mt-1 flex items-center gap-2 text-white/70">
            <span>{formatStat(v.views)} views</span>
            <span>·</span>
            <span>{formatStat(v.likes)} likes</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-1 p-2">
        <Link
          href={`/feed?v=${v.id}`}
          className="flex-1 rounded-xl border px-3 py-1.5 text-center text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          ดู
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting || v.status === 'DELETED'}
          className="flex-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? 'กำลังลบ…' : 'ลบ'}
        </button>
      </div>
      <div className="border-t px-2 pb-2 pt-1 text-[10px] text-ink-400">
        โพสต์เมื่อ {formatDate(v.createdAt)}
      </div>
    </li>
  );
}

function formatStat(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
